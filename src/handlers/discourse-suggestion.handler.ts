import { On } from '@discord-nestjs/core';
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Events,
  Message,
  PrivateThreadChannel,
  PublicThreadChannel,
} from 'discord.js';
import { DiscourseProvider } from '../providers/index.js';
import { FetchedMessageGuard, NewForumThreadGuard } from './guards/index.js';

@Injectable()
export class DiscourseSuggestionsHandler {
  readonly #logger = new Logger(DiscourseSuggestionsHandler.name);
  readonly #allowedChannels: string[];

  constructor(
    configService: ConfigService,
    private readonly discourse: DiscourseProvider,
  ) {
    this.#allowedChannels =
      configService.get<string>('DISCOURSE_DISCORD_CHANNELS')?.split(',') ?? [];
  }

  @On(Events.MessageCreate)
  @UseGuards(FetchedMessageGuard, NewForumThreadGuard)
  async onMessageCreate(
    message: Message & { channel: PublicThreadChannel | PrivateThreadChannel },
  ): Promise<void> {
    this.#logger.debug(`Received message in thread ${message.channel.name}`);

    const threadChannel = message.channel.parentId;

    if (
      !threadChannel ||
      message.author.bot ||
      !this.#allowedChannels.includes(threadChannel)
    ) {
      this.#logger.debug('Ignoring message', {
        threadChannel,
        author: message.author.id,
        allowedChannels: this.#allowedChannels,
      });
      return;
    }

    this.#logger.log('Checking for suggestions');

    const suggestions = await this.discourse.similarTopics(
      message.channel.name,
      message.content,
    );

    if (suggestions.length === 0) {
      this.#logger.log('Found no suggestions.');

      return;
    }

    this.#logger.log(`Found ${suggestions.length} suggestions.`);

    await message.channel.send({
      content: `I found some similar topics that might help you:\n-# _ _\n${suggestions
        .map(
          (suggestion) =>
            `**[${suggestion.title}](<${suggestion.url}>)**\n-# ${suggestion.snippet}`,
        )
        .join('\n-# _ _\n')}_\n-# _ _
If any of these topics solve your problem, please close this thread. Thank you!`,
      options: {
        allowedMentions: {
          repliedUser: false,
          parse: [],
          roles: [],
          users: [],
        },
      },
    });
  }
}
