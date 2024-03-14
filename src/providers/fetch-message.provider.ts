import { Injectable } from '@nestjs/common';
import { type Guild, type Message } from 'discord.js';

/**
 * Provides a way to fetch messages by ID.
 */
@Injectable()
export class FetchMessageProvider {
  /**
   * Fetches a message by its ID.
   * @param guild The guild to fetch the message from.
   * @param messageId The ID of the message to fetch.
   */
  async fetchMessage(guild: Guild, messageId: string): Promise<Message | null> {
    const results = Promise.all(
      guild.channels.cache
        .filter((channel) => channel.isTextBased())
        .map((channel) =>
          (async () => {
            try {
              return 'messages' in channel
                ? await channel.messages.fetch(messageId)
                : null;
            } catch {
              return null;
            }
          })(),
        ),
    );

    const messages = await results;

    return messages.find((message) => message !== null) ?? null;
  }
}
