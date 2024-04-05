import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import {
  ChannelType,
  Collection,
  Message,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { OpenAiProvider } from '../providers';

export class SummarizeCommandParams {}

/**
 * Summarizes the past messages in the current thread.
 */
@Injectable()
@Command({
  name: 'summary',
  description: 'Summarizes the past messages in the current thread.',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class SummarizeCommand {
  constructor(private readonly openai: OpenAiProvider) {}

  #logger = new Logger(SummarizeCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    {}: SummarizeCommandParams,
  ): Promise<void> {
    this.#logger.log(`Summarizing past messages in the current thread`);

    if (!this.openai.isAvailable) {
      await interaction.reply({
        content:
          'This command is not available because it has not been configured.',
        ephemeral: true,
      });

      return;
    }

    // Make sure the current channel is a thread
    if (
      !interaction.channel?.isThread() ||
      interaction.channel.parent?.type !== ChannelType.GuildForum
    ) {
      await interaction.reply({
        content: 'This command can only be used in a thread in a forum.',
        ephemeral: true,
      });

      return;
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    try {
      const batchSize = 100;
      let messages: Message[] = [];
      let lastMessageId: string | null | undefined =
        interaction.channel?.lastMessageId;
      let batch: Collection<string, Message>;

      do {
        batch = await interaction.channel?.messages.fetch({
          limit: batchSize,
          ...(lastMessageId ? { before: lastMessageId } : {}),
        });

        if (!batch.size) {
          break;
        }

        messages = messages.concat(batch.toJSON());
        lastMessageId = batch.last()?.id;
      } while (messages.length < 500 && lastMessageId);

      if (!messages) {
        this.#logger.warn('No messages found in the current thread');
        interaction.editReply('No messages found in the current thread');
        return;
      }

      const content = messages
        .reverse()
        .filter((message) => message.author.bot === false)
        .map(
          (message) =>
            `@${message.author.id} (${message.author.username}): ${message.content}`,
        )
        .join('\n');

      const response = await this.openai.summarize(
        content,
        `If your summary contains a user mention with a numeric user ID (e.g. @123456789...), it must be formatted as <@numericuserid>, and for channels, <#numericchannelid>. Do not surround the bracketed mentions with code backticks.
Where possible, _always_ refer to users with a mention (e.g. <@numericuserid>), not with a username. This is because usernames can change, but IDs are permanent.
Use a concise and clear writing style. Avoid using jargon or overly complex language.
Use bullet points or numbered lists to organize information.
Use bold or italic text to emphasize key points.`,
      );

      if (!response) {
        this.#logger.warn('Failed to summarize past messages');
        interaction.editReply('Failed to summarize past messages');
        return;
      }

      interaction.editReply(response);
    } catch (err) {
      this.#logger.error('Failed to summarize past messages', err);
      interaction.editReply('Failed to summarize past messages');
    }
  }
}
