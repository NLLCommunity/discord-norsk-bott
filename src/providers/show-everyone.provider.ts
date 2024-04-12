import { Injectable, Logger } from '@nestjs/common';
import {
  ButtonStyle,
  ButtonInteraction,
  ButtonBuilder,
  Client,
  ActionRowBuilder,
} from 'discord.js';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { RateLimiterProvider } from './rate-limiter.provider';
import { GuildButtonCollectorProvider } from './guild-button-collector.provider';
import { DisplayLanguage } from '../types';

enum Messages {
  ShowEveryone,
  RateLimited,
  RequestedBy,
  UsedCommand,
}

const timeFormats: Record<DisplayLanguage, Intl.RelativeTimeFormat> = {
  [DisplayLanguage.Norwegian]: new Intl.RelativeTimeFormat('nn-NO', {
    style: 'long',
  }),
  [DisplayLanguage.English]: new Intl.RelativeTimeFormat('en-US', {
    style: 'long',
  }),
};

const formatTime = (ms: number, displayLanguage: DisplayLanguage) => {
  const seconds = Math.round(ms / 1000);

  // use minutes/hours when appropriate

  if (seconds > 60 * 60) {
    return timeFormats[displayLanguage].format(
      Math.round(seconds / (60 * 60)),
      'hour',
    );
  }

  if (seconds > 60) {
    return timeFormats[displayLanguage].format(
      Math.round(seconds / 60),
      'minute',
    );
  }

  return timeFormats[displayLanguage].format(seconds, 'second');
};

const MessageText = {
  [DisplayLanguage.Norwegian]: {
    [Messages.RateLimited]: (waitMs: number) =>
      `Du har brukt denne kommandoen for mykje i det siste. Prøv igjen ${formatTime(
        waitMs,
        DisplayLanguage.Norwegian,
      )}.`,
    [Messages.ShowEveryone]: 'Vis til alle',
    [Messages.RequestedBy]: (user: string) => `Spurt av ${user}`,
    [Messages.UsedCommand]: (user: string, command: string) =>
      `${user} brukte kommandoen ${command}`,
  },
  [DisplayLanguage.English]: {
    [Messages.RateLimited]: (waitMs: number) =>
      `You have used this command too much recently. Try again ${formatTime(
        waitMs,
        DisplayLanguage.English,
      )}.`,
    [Messages.ShowEveryone]: 'Show everyone',
    [Messages.RequestedBy]: (user: string) => `Requested by ${user}`,
    [Messages.UsedCommand]: (user: string, command: string) =>
      `${user} used the command ${command}`,
  },
};

/**
 * Provides a way to send what was once an ephemeral message to everyone in the
 * channel that the message was sent in.
 */
@Injectable()
export class ShowEveryoneProvider {
  #logger = new Logger(ShowEveryoneProvider.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly rateLimiter: RateLimiterProvider,
    guildCollectors: GuildButtonCollectorProvider,
  ) {
    guildCollectors.addHandler('showeveryone', (interaction) =>
      this.#handle(interaction),
    );
    guildCollectors.addHandler('vistilalle', (interaction) =>
      this.#handle(interaction),
    );
  }

  /**
   * Handles the command.
   * @param collectorInteraction The interaction event.
   */
  async #handle(collectorInteraction: ButtonInteraction): Promise<void> {
    const { channel, message, customId } = collectorInteraction;

    const language =
      customId === 'showeveryone'
        ? DisplayLanguage.English
        : customId === 'vistilalle'
          ? DisplayLanguage.Norwegian
          : undefined;

    if (!language || !channel || !('name' in channel)) {
      return;
    }

    try {
      // Post ephemeral message to the channel for everyone to see
      // Rate limit like it were a normal command with vistilalle/showeveryone
      // passed as true

      const rateLimitKey = ShowEveryoneProvider.name;

      const result = this.rateLimiter.rateLimit(
        rateLimitKey,
        collectorInteraction as any,
        {
          byUser: false,
        },
      );

      if (result.isRateLimited) {
        collectorInteraction.reply({
          content: MessageText[DisplayLanguage.Norwegian][Messages.RateLimited](
            result.timeUntilNextUse!,
          ),
          ephemeral: true,
        });
        return;
      }

      // Take the existing translation message and send a copy to the channel
      // that isn't ephemeral

      // Create a new message with the same content as the original message
      const newMessage = message.embeds[0].toJSON();

      // Modify the embed such that the requesting user's name is added to the
      // beginning of the footer

      const requestedBy = message.interaction
        ? MessageText[language][Messages.UsedCommand](
            '@' + message.interaction.user.tag,
            message.interaction.commandName,
          )
        : MessageText[language][Messages.RequestedBy](
            '@' + collectorInteraction.user.tag,
          );

      newMessage.footer = {
        ...(newMessage.footer ?? {}),
        text:
          requestedBy +
          (newMessage.footer?.text ? `\n${newMessage.footer.text}` : ''),
      };

      // Send a new reply that's not ephemeral
      await collectorInteraction.reply({
        embeds: [newMessage],
      });
    } catch (error) {
      this.#logger.error(
        `Failed to show translation to everyone for ${collectorInteraction.user.tag} in ${channel.name}`,
        error,
      );
    }
  }

  /**
   * Returns a button that, when clicked, sends the message to everyone in the
   * channel.
   * @param displayLanguage The language to display the button in. Defaults to
   * English.
   * @returns The button.
   */
  getButton(
    displayLanguage: DisplayLanguage = DisplayLanguage.English,
  ): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId(
        displayLanguage === DisplayLanguage.Norwegian
          ? 'vistilalle'
          : 'showeveryone',
      )
      .setLabel(MessageText[displayLanguage][Messages.ShowEveryone])
      .setStyle(ButtonStyle.Secondary);
  }

  /**
   * Returns an action row with a button that, when clicked, sends the message
   * to everyone in the channel.
   * @param displayLanguage The language to display the button in. Defaults to
   * English.
   * @returns The action row.
   */
  getActionRow(
    displayLanguage: DisplayLanguage = DisplayLanguage.English,
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      this.getButton(displayLanguage),
    );
  }
}
