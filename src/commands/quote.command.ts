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
  messageLink,
} from 'discord.js';
import {
  FetchMessageProvider,
  RateLimiterProvider,
  SanitizationProvider,
  TenorProvider,
} from '../providers/index.js';

export class QuoteCommandParams {
  @Param({
    name: 'messageid',
    description: 'The ID of the message to quote',
    type: ParamType.STRING,
    required: true,
  })
  messageId: string;

  @Param({
    name: 'context',
    description:
      'Whether to include the context of the message (e.g. what it replied to)',
    type: ParamType.BOOLEAN,
    required: false,
  })
  context?: boolean;
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
    private readonly tenor: TenorProvider,
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
    { messageId, context }: QuoteCommandParams,
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

      const embeds: EmbedBuilder[] = [await this.#createEmbed(message)];

      if (context && message.reference?.messageId) {
        const contextMessage = await message.channel.messages.fetch(
          message.reference.messageId,
        );

        if (contextMessage) {
          embeds.unshift(await this.#createEmbed(contextMessage));
        }
      }

      await interaction.editReply({ embeds });
    } catch (error) {
      this.#logger.error(error);
      await interaction.editReply(
        'An error occurred while quoting the message.',
      );
    }
  }

  /**
   * Returns an embed for the given message.
   * @param message The message to quote.
   */
  async #createEmbed(message: Message): Promise<EmbedBuilder> {
    const { content } = message;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: message.author?.tag,
        iconURL: message.author?.displayAvatarURL(),
      })
      .setTimestamp(message.createdAt);

    const tenorGifUrl = await this.tenor.getGifUrl(content);

    if (tenorGifUrl) {
      console.log(tenorGifUrl);
      embed.setImage(tenorGifUrl);
    }

    if (message.attachments.size > 0) {
      const attachment = message.attachments.first();

      if (attachment?.contentType?.startsWith('image')) {
        embed.setImage(attachment.url);
      }

      const attachments: string[] = [];

      for (const [index, attachment] of message.attachments
        .toJSON()
        .entries()) {
        if (index === 0 && attachment.contentType?.startsWith('image')) {
          continue;
        }

        attachments.push(`[${attachment.name}](${attachment.url})`);
      }

      if (attachments.length > 0) {
        embed.addFields([
          {
            name: 'Attachments',
            value: attachments.join('\n'),
          },
        ]);
      }
    }

    embed.setDescription(
      content.length > 2000
        ? content.slice(0, 1999) + '…'
        : content || '[Empty message]',
    );

    let messageLinks = messageLink(message.channelId, message.id);

    if (message.reference?.messageId) {
      messageLinks += ` (reply to ${messageLink(message.channelId, message.reference.messageId)})`;
    }

    embed.addFields([
      {
        name: ' ',
        value: messageLinks,
      },
    ]);

    return embed;
  }
}
