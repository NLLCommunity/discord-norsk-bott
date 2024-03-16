import { Injectable, Logger } from '@nestjs/common';
import { type ChatInputCommandInteraction } from 'discord.js';
import { InteractionDataProvider } from './interaction-data.provider';

export interface RateLimiterOptions {
  /**
   * The length of the sliding window in milliseconds. Defaults to 1 minute.
   */
  window?: number;

  /**
   * The maximum number of uses per window. Defaults to 3.
   */
  maxPerWindow?: number;
}

/**
 * Rate limits commands by keeping track of the last time a command was used by
 * a user in the same channel. Implements a sliding window algorithm.
 */
@Injectable()
export class RateLimiterProvider {
  #logger = new Logger(RateLimiterProvider.name);
  #numberFormat = new Intl.NumberFormat('en-US', {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'long',
    maximumFractionDigits: 0,
  });

  #lastUsed = new Map<string, { windowStart: number; uses: number }>();

  constructor(
    private readonly interactionDataProvider: InteractionDataProvider,
  ) {}

  /**
   * Checks if the user is rate limited. If they are, responds with an ephemeral
   * message. If not, updates the last used time for the user and channel. Users
   * with the ability to kick members are not rate limited.
   * @param key The key to use for rate limiting. This should be unique to the
   * command.
   * @param interaction The interaction to check rate limiting for.
   * @param options The rate limiting options.
   * @returns Whether the user is rate limited.
   */
  isRateLimited(
    key: string,
    interaction: ChatInputCommandInteraction,
    { window = 1 * 60 * 1000, maxPerWindow = 3 }: RateLimiterOptions = {},
  ): boolean {
    const interactionData =
      this.interactionDataProvider.getDataFor(interaction);

    if (interactionData.isModerator()) {
      return false;
    }

    const mapKey = `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}:${key}`;
    const now = Date.now();
    let entry = this.#lastUsed.get(mapKey);

    if (!entry) {
      entry = { windowStart: now, uses: 0 };
      this.#lastUsed.set(mapKey, entry);
    } else if (now - entry.windowStart > window) {
      entry.windowStart = now;
      entry.uses = 0;
    }

    if (entry.uses + 1 > maxPerWindow) {
      this.#logger.log(
        `Rate limited ${interaction.user.tag} in ${interactionData.getChannelName()} for ${key}`,
      );

      interaction
        .reply({
          content: `You are doing that too much. Please try again in ${this.#numberFormat.format(
            (entry.windowStart + window - now) / 1000,
          )}.`,
          ephemeral: true,
        })
        .catch((error) => {
          this.#logger.warn(
            `Failed to send rate limit message to ${interaction.user.tag} in ${interactionData.getChannelName()}`,
            error,
          );
        });

      return true;
    }

    entry.uses++;

    return false;
  }
}
