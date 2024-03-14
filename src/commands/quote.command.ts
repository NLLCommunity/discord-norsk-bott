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
import { FetchMessageProvider } from '../providers';

export class QuoteCommandParams {
  @Param({
    name: 'messageid',
    description: 'The ID of the message to quote',
    type: ParamType.STRING,
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

  constructor(private messageFetcher: FetchMessageProvider) {}

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

    const message = await this.messageFetcher.fetchMessage(
      interaction.guild,
      messageId,
    );

    if (!message) {
      await interaction.editReply(
        `Could not find a message with ID ${messageId}`,
      );
      return;
    }

    const body =
      (message.content || '[Empty message]') +
      `\n[(Jump to message)](${message.url})`;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL(),
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
