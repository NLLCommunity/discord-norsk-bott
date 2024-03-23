import { Injectable, Logger } from '@nestjs/common';
import { Handler, InteractionEvent, SubCommand } from '@discord-nestjs/core';
import {
  ChannelType,
  ChatInputCommandInteraction,
  Collection,
  Message,
  PublicThreadChannel,
  TextChannel,
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

      for (const page of pages) {
        // Find the channel to sync to
        const channel = interaction.guild?.channels.cache.get(page.channel);

        this.#logger.debug(
          `Syncing page ${page.hash} to channel ${page.channel}`,
        );

        if (
          !channel ||
          (channel.type !== ChannelType.GuildText &&
            channel.type !== ChannelType.PublicThread)
        ) {
          continue;
        }

        // Find the message
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
          this.#logger.debug(`Updating content in channel ${page.channel}`);
          await this.#updateMessage({
            channel,
            page,
            oldMessages,
          });
        } else {
          // Post the message
          this.#logger.debug(`Posting content to channel ${page.channel}`);
          const newMessages = this.#paginateContent(page);

          for (const message of newMessages) {
            await channel.send({ content: message });
          }
        }
      }

      await interaction.editReply({
        content: 'Sync complete.',
      });
    } catch (error) {
      this.#logger.error('An error occurred while syncing with Notion.', error);
      await interaction.editReply({
        content: 'An error occurred while syncing.',
      });
    }
  }

  #paginateContent({ content, hash }: SyncPage): string[] {
    // split by lines, then append until we reach 1900 characters, then start a
    // new message

    const messages: string[] = [];
    const now = new Date();

    let currentMessage = '';

    content += `\n\nSync ID: ${hash}\nLast updated: ${norwegianTime.format(
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
        // // append the hash to the content so we can look it up later

        // currentMessage += `\n\nSync ID: ${hash}\nLast updated: ${norwegianTime.format(
        //   now,
        // )}`;
        messages.push(currentMessage);
        currentMessage = '';
      }

      currentMessage += line + '\n';
    }

    if (currentMessage.length > 0) {
      // currentMessage += `\n\nSync ID: ${hash}\nLast updated: ${norwegianTime.format(
      //   now,
      // )}`;

      messages.push(currentMessage);
    }

    return messages;
  }

  async #updateMessage({
    channel,
    page,
    oldMessages,
  }: {
    channel: TextChannel | PublicThreadChannel;
    page: SyncPage;
    oldMessages: Collection<string, Message>;
  }): Promise<void> {
    const paginated = this.#paginateContent(page);

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
        await oldMessage.edit(paginated[i]);
      } else {
        await channel.send({ content: paginated[i] });
      }
    }
  }
}
