import { Injectable, Logger } from '@nestjs/common';
import { Handler, InteractionEvent, SubCommand } from '@discord-nestjs/core';
import {
  AnyThreadChannel,
  ChannelType,
  ChatInputCommandInteraction,
  Collection,
  ForumChannel,
  GuildBasedChannel,
  Message,
  PublicThreadChannel,
  TextChannel,
  User,
  Webhook,
} from 'discord.js';
import {
  InteractionDataProvider,
  NotionService,
  SyncPage,
} from '../../providers';

const norwegianTime = new Intl.DateTimeFormat('no-NO', {
  timeZone: 'Europe/Oslo',
  dateStyle: 'long',
  timeStyle: 'long',
});

interface Result {
  success: boolean;
  message?: string;
}

type ChannelInfo =
  | {
      type: 'channel';
      channel: TextChannel | AnyThreadChannel;
      webhook?: Webhook;
    }
  | {
      type: 'forum';
      channel: ForumChannel;
      webhook?: Webhook;
    };

@Injectable()
@SubCommand({
  name: 'sync',
  description: 'Syncs informational channels with content from Notion',
})
export class SyncSubCommand {
  readonly #logger = new Logger(SyncSubCommand.name);

  constructor(
    private readonly notionService: NotionService,
    private readonly interactionDataProvider: InteractionDataProvider,
  ) {}

  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!this.notionService.isConfigured) {
      interaction.reply({
        content: 'Notion integration is not configured.',
        ephemeral: true,
      });

      return;
    }

    // Handle the sync command
    const interactionData =
      this.interactionDataProvider.getDataFor(interaction);

    if (!interactionData.isModerator()) {
      interaction.reply({
        content: 'You do not have permission to run this command.',
        ephemeral: true,
      });

      return;
    }

    await interaction.deferReply({ ephemeral: true });

    this.#logger.log('Syncing with Notion...');

    try {
      // Sync the pages
      const pages = await this.notionService.getPagesToSync();

      // For each page:
      //   - Find the channel to sync to
      //   - See if the bot has already posted the content by searching for the
      //     page ID in the channel's messages (limit to messages from the bot)
      //   - If the bot has not posted the content, post it
      //   - If the bot has posted the content, update it and the timestamp

      const webhooks = await interaction.guild?.fetchWebhooks();

      const results: string[] = [];

      for (const page of pages) {
        if (page.guild !== interaction.guildId) {
          continue;
        }

        const info = await this.#getChannelInfo({
          interaction,
          page,
          webhooks,
        });

        if (!info) {
          this.#logger.error(
            `Page "${page.title}" has no channel or webhook ID, or webhook not found`,
          );
          results.push(
            `- ❌ [${page.title}] Page has no channel or webhook ID, or webhook not found`,
          );
          continue;
        }

        const result =
          info.type === 'forum'
            ? await this.#syncToThread({
                interaction,
                page: page,
                info,
              })
            : await this.#syncToChannel({
                interaction,
                page: page as SyncPage & Required<Pick<SyncPage, 'channel'>>,
                info,
              });

        results.push(
          result.success
            ? `- ✅ [${page.title}] ${result.message}`
            : `- ❌ [${page.title}] ${result.message}`,
        );
      }

      await interaction.editReply({
        content: results.length > 0 ? results.join('\n') : 'No pages to sync.',
      });
    } catch (error) {
      this.#logger.error('An error occurred while syncing with Notion.', error);
      await interaction.editReply({
        content: 'An error occurred while syncing.',
      });
    }
  }

  async #getChannelInfo({
    interaction,
    webhooks,
    page,
  }: {
    interaction: ChatInputCommandInteraction;
    webhooks?: Collection<string, Webhook>;
    page: SyncPage;
  }): Promise<ChannelInfo | undefined> {
    try {
      if (!page.channel && !page.webhook) {
        return undefined;
      }

      let channel: GuildBasedChannel | undefined;
      let webhook: Webhook | undefined;

      if (page.webhook) {
        webhook = webhooks?.get(page.webhook);

        if (!webhook) {
          return undefined;
        }

        channel = interaction.guild?.channels.cache.get(webhook.channelId);
      } else if (page.channel) {
        channel = interaction.guild?.channels.cache.get(page.channel);
      } else {
        return undefined;
      }

      if (!channel) {
        return undefined;
      }

      if (page.thread) {
        return channel.type === ChannelType.GuildForum
          ? {
              type: 'forum',
              channel,
              webhook,
            }
          : undefined;
      }

      return channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.PublicThread ||
        channel.type === ChannelType.PrivateThread
        ? {
            type: 'channel',
            channel,
            webhook,
          }
        : undefined;
    } catch (error) {
      this.#logger.error('Error while getting channel info', error);
      return undefined;
    }
  }

  async #syncToChannel({
    interaction,
    page,
    info,
  }: {
    interaction: ChatInputCommandInteraction;
    page: SyncPage & Required<Pick<SyncPage, 'channel'>>;
    info: ChannelInfo & { type: 'channel' };
  }): Promise<Result> {
    try {
      const messages = await info.channel.messages.fetch({ limit: 100 });
      const oldMessages = messages
        .filter((m) =>
          info.webhook
            ? m.author.id === info.webhook.id
            : m.author.bot && m.author.id === interaction.client.user?.id,
        )
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      if (oldMessages.size > 0) {
        // Update the message
        await this.#updateMessage({
          channel: info.webhook || info.channel,
          page,
          oldMessages,
          user: interaction.user,
        });
      } else {
        // Post the message
        const newMessages = this.#paginateContent(page, interaction.user);

        for (const message of newMessages) {
          if (info.webhook) {
            await info.webhook.send({ content: message });
          } else {
            await info.channel.send({ content: message });
          }
        }
      }

      return {
        success: true,
        message: info.webhook
          ? `Synced with webhook ${info.webhook.name} in channel #${info.channel.name}`
          : `Synced with channel #${info.channel.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async #syncToThread({
    interaction,
    page,
    info,
  }: {
    interaction: ChatInputCommandInteraction;
    page: SyncPage;
    info: ChannelInfo & { type: 'forum' };
  }): Promise<Result> {
    try {
      const { threads } = await info.channel.threads.fetch();
      let matching: AnyThreadChannel | undefined = undefined;

      for (const thread of threads.values()) {
        await thread.messages.fetch({ limit: 100 });

        if (
          thread.messages.cache.some(
            (m) =>
              m.content.includes(page.hash) &&
              (info.webhook
                ? m.author.id === info.webhook.id
                : m.author.bot && m.author.id === interaction.client.user?.id),
          )
        ) {
          matching = thread;
          break;
        }
      }

      if (matching) {
        // Update the thread title
        await matching.setName(page.title);

        // Update the message
        await this.#updateMessage({
          channel: info.webhook || matching,
          page,
          oldMessages: matching.messages.cache.sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp,
          ),
          user: interaction.user,
          threadId: matching.id,
        });
      } else {
        // Post the message
        const newMessages = this.#paginateContent(page, interaction.user);

        // The very first message needs to create the thread

        const starter = newMessages.shift();

        if (!starter) {
          return {
            success: false,
            message: 'Failed to create the first message',
          };
        }

        if (!info.webhook) {
          const thread = await info.channel.threads.create({
            name: page.title,
            autoArchiveDuration: 60,
            message: {
              content: starter,
            },
          });

          // Post the rest of the messages in the thread

          for (const message of newMessages) {
            await thread.send({ content: message });
          }
        } else {
          const firstMessage = await info.webhook.send({
            content: starter,
            threadName: page.title,
          });

          // Find the thread with the first message ID

          const thread = info.channel.threads.cache.find((t) =>
            t.messages.cache.has(firstMessage.id),
          );

          if (!thread) {
            return {
              success: false,
              message: 'Failed to find the thread',
            };
          }

          // Post the rest of the messages in the thread

          for (const message of newMessages) {
            await info.webhook.send({
              content: message,
              threadId: thread.id,
            });
          }
        }
      }

      return {
        success: true,
        message: `Synced with forum channel #${info.channel.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  #paginateContent({ content, hash }: SyncPage, user: User): string[] {
    // split by lines, then append until we reach 1900 characters, then start a
    // new message

    const messages: string[] = [];
    const now = new Date();

    let currentMessage = '';

    content += `\n\nPage ID: ${hash}\nLast synced by ${user} at ${norwegianTime.format(
      now,
    )}`;

    const lines = content.split('\n');

    const maxMessageLength = 2000;
    // const leeway = 100;
    const leeway = 0;

    const truncateTo = maxMessageLength - leeway;

    // ensure no line is longer than truncateTo characters
    const truncatedLines = lines.reduce((acc, line) => {
      if (line.length > truncateTo) {
        let remainingLine = line;

        while (remainingLine.length > truncateTo) {
          acc.push(remainingLine.slice(0, truncateTo));
          remainingLine = remainingLine.slice(truncateTo);
        }

        if (remainingLine.length > 0) {
          acc.push(remainingLine);
        }
      } else {
        acc.push(line);
      }

      return acc;
    }, [] as string[]);

    for (const line of truncatedLines) {
      if (currentMessage.length + line.length > truncateTo) {
        messages.push(currentMessage);
        currentMessage = '';
      }

      currentMessage += line + '\n';
    }

    if (currentMessage.length > 0) {
      messages.push(currentMessage);
    }

    return messages;
  }

  async #updateMessage({
    channel,
    page,
    oldMessages,
    user,
    threadId,
  }: {
    channel: TextChannel | PublicThreadChannel | AnyThreadChannel | Webhook;
    page: SyncPage;
    oldMessages: Collection<string, Message>;
    user: User;
    threadId?: string;
  }): Promise<void> {
    const paginated = this.#paginateContent(page, user);

    // Check if there are more new messages than old messages
    if (paginated.length > oldMessages.size) {
      // Delete the old messages, then post the new ones
      for (const message of oldMessages.values()) {
        await message.delete();
      }

      for (const message of paginated) {
        await channel.send({ content: message });
      }

      return;
    }

    // Update the old messages

    for (let i = 0; i < paginated.length; i++) {
      const oldMessage = oldMessages.at(i);

      if (oldMessage) {
        if ('editMessage' in channel) {
          await channel.editMessage(oldMessage.id, {
            content: paginated[i],
            threadId,
          });
        } else {
          await oldMessage.edit(paginated[i]);
        }
      } else {
        await channel.send({ content: paginated[i] });
      }
    }
  }
}
