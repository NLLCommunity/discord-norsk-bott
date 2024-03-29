import { Injectable, Logger } from '@nestjs/common';
import {
  Command,
  Handler,
  InteractionEvent,
  Param,
  ParamType,
} from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  Message,
} from 'discord.js';
import {
  FetchMessageProvider,
  RateLimiterProvider,
  SanitizationProvider,
} from '../providers';

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
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class QuoteCommand {
  #logger = new Logger(QuoteCommand.name);

  constructor(
    private messageFetcher: FetchMessageProvider,
    private sanitizer: SanitizationProvider,
    private readonly rateLimiter: RateLimiterProvider,
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
    if (this.rateLimiter.isRateLimited(QuoteCommand.name, interaction)) {
      return;
    }

    this.#logger.log(`Quoting message with ID ${messageId}`);

    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

    const trimmed = messageId.trim();
    const sanitized = this.sanitizer.truncate(
      this.sanitizer.sanitizeNumber(trimmed),
      20,
    );

    try {
      // const message = trimmed.startsWith('https')
      //   ? await this.messageFetcher.fetchMessageByUrl(
      //       interaction.guild,
      //       trimmed,
      //     )
      //   : await this.messageFetcher.fetchMessage(interaction.guild, sanitized);

      let message: Message | null = null;

      if (trimmed.startsWith('https')) {
        await interaction.deferReply();

        message = await this.messageFetcher.fetchMessageByUrl(
          interaction.guild,
          trimmed,
        );
      } else {
        if (!sanitized) {
          await interaction.reply({
            content:
              'The provided message ID is invalid. You must provide either the message link or the message ID.',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply();

        message = await this.messageFetcher.fetchMessage(
          interaction.guild,
          sanitized,
        );
      }

      if (!message) {
        await interaction.editReply(
          `Could not find a message with ID \`${sanitized}\``,
        );
        return;
      }

      // check if user has permission to view the message by checking if the user
      // has permission to view the channel
      if (
        'permissionsFor' in message.channel &&
        !message.channel
          .permissionsFor(interaction.member as GuildMember)
          ?.has(PermissionFlagsBits.ViewChannel)
      ) {
        await interaction.editReply(
          'You do not have permission to view the channel this message is in.',
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
    } catch (error) {
      this.#logger.error(error);
      await interaction.editReply(
        'An error occurred while quoting the message.',
      );
    }
  }
}
