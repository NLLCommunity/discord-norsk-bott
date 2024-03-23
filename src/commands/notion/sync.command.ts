import { Injectable, Logger } from '@nestjs/common';
import { Handler, InteractionEvent, SubCommand } from '@discord-nestjs/core';
import {
  ChannelType,
  ChatInputCommandInteraction,
  Collection,
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
        if (page.channel) {
          const result = await this.#syncToChannel({
            interaction,
            page: page as SyncPage & Required<Pick<SyncPage, 'channel'>>,
          });
          results.push(
            result.success
              ? `- ✅ [${page.title}] ${result.message}`
              : `- ❌ [${page.title}] ${result.message}`,
          );
        } else if (page.webhook && webhooks) {
          const result = await this.#syncToWebhook({
            interaction,
            webhooks,
            page: page as SyncPage & Required<Pick<SyncPage, 'webhook'>>,
          });
          results.push(
            result.success
              ? `- ✅ [${page.title}] ${result.message}`
              : `- ❌ [${page.title}] ${result.message}`,
          );
        } else {
          this.#logger.error(
            `Page "${page.title}" has no channel or webhook ID, or webhook not found`,
          );
          results.push(
            `- ❌ [${page.title}] Page has no channel or webhook ID, or webhook not found`,
          );
        }
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

  async #syncToChannel({
    interaction,
    page,
  }: {
    interaction: ChatInputCommandInteraction;
    page: SyncPage & Required<Pick<SyncPage, 'channel'>>;
  }): Promise<Result> {
    try {
      const channel = interaction.guild?.channels.cache.get(page.channel);

      if (
        !channel ||
        (channel.type !== ChannelType.GuildText &&
          channel.type !== ChannelType.PublicThread)
      ) {
        return {
          success: false,
          message: `Channel with ID ${page.channel} not found, or is not a text/thread channel`,
        };
      }

      const messages = await channel.messages.fetch({ limit: 100 });
      const oldMessages = messages
        .filter(
          (m) =>
            // m.content.includes(page.hash) &&
            m.author.bot && m.author.id === interaction.client.user?.id,
        )
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      if (oldMessages.size > 0) {
        // Update the message
        await this.#updateMessage({
          channel,
          page,
          oldMessages,
          user: interaction.user,
        });
      } else {
        // Post the message
        const newMessages = this.#paginateContent(page, interaction.user);

        for (const message of newMessages) {
          await channel.send({ content: message });
        }
      }

      return {
        success: true,
        message: `Synced with channel #${channel.name}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async #syncToWebhook({
    interaction,
    webhooks,
    page,
  }: {
    interaction: ChatInputCommandInteraction;
    webhooks: Collection<string, Webhook>;
    page: SyncPage & Required<Pick<SyncPage, 'webhook'>>;
  }): Promise<Result> {
    try {
      const webhook = webhooks.get(page.webhook);

      if (!webhook) {
        return {
          success: false,
          message: `Webhook for page ${page.title} not found`,
        };
      }

      // To get the message IDs, we actually need to use the usual message fetch
      // method. Webhooks only allow fetching a message by its ID, not all
      // messages sent previously by the webhook.

      const channel = interaction.guild?.channels.cache.get(webhook.channelId);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return {
          success: false,
          message: `Channel for webhook ${webhook.name} not found, or is not a text channel`,
        };
      }

      const messages = await channel.messages.fetch({ limit: 100 });

      const oldMessages = messages
        .filter((m) => m.author.id === webhook.id)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      if (oldMessages.size > 0) {
        // Update the message
        await this.#updateMessage({
          channel: webhook,
          page,
          oldMessages,
          user: interaction.user,
        });
      } else {
        // Post the message
        const newMessages = this.#paginateContent(page, interaction.user);

        for (const message of newMessages) {
          await webhook.send({ content: message });
        }
      }

      return {
        success: true,
        message: `Synced with webhook ${webhook.name}`,
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
  }: {
    channel: TextChannel | PublicThreadChannel | Webhook;
    page: SyncPage;
    oldMessages: Collection<string, Message>;
    user: User;
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
