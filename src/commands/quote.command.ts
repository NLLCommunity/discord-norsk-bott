import { Injectable, Logger } from '@nestjs/common';
import {
  Command,
  Handler,
  InteractionEvent,
  Param,
  ParamType,
} from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { FetchMessageProvider, SanitizationProvider } from '../providers';

export class QuoteCommandParams {
  @Param({
    name: 'messageid',
    description: 'The ID of the message to quote',
    type: ParamType.STRING,
    required: true,
  })
  messageId: string;
}

/**
 * A command for quoting messages.
 */
@Injectable()
@Command({
  name: 'quote',
  description: 'Quotes a message',
})
export class QuoteCommand {
  #logger = new Logger(QuoteCommand.name);

  constructor(
    private messageFetcher: FetchMessageProvider,
    private sanitizer: SanitizationProvider,
  ) {}

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param messageId The ID of the message to quote.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { messageId }: QuoteCommandParams,
  ): Promise<void> {
    await interaction.deferReply();

    this.#logger.log(`Quoting message with ID ${messageId}`);

    if (!interaction.guild) {
      await interaction.editReply('This command can only be used in a server');
      return;
    }

    const match = messageId.match(
      /https:\/\/discord.com\/channels\/\d+\/\d+\/(?<messageId>\d+)/,
    );

    const sanitized = match
      ? match.groups?.messageId!
      : this.sanitizer.sanitize(this.sanitizer.truncate(messageId, 20));

    const message = await this.messageFetcher.fetchMessage(
      interaction.guild,
      sanitized,
    );

    if (!message) {
      await interaction.editReply(
        `Could not find a message with ID ${sanitized}`,
      );
      return;
    }

    const body =
      (message.content || '[Empty message]') +
      `\n[(Jump to message)](${message.url})`;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.author?.tag,
        iconURL: message.author?.displayAvatarURL(),
      })
      .setDescription(body)
      .setTimestamp(message.createdAt)
      .setFooter({
        text:
          'name' in message.channel
            ? `#${message.channel.name}`
            : 'Unknown channel',
      });

    await interaction.editReply({ embeds: [embed] });
  }
}
