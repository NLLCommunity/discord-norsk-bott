import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as YAML from 'yaml';
import { Client, channelMention, channelLink, hideLinkEmbed } from 'discord.js';
import { InjectDiscordClient } from '@discord-nestjs/core';
import pLimit from 'p-limit';
import { DiscourseProvider } from './discourse.provider.js';

export interface DiscourseSyncPageMetadata {
  guild: string;
  thread: boolean;
  channel?: string;
  webhook?: string;
}

export interface DiscourseSyncPage extends DiscourseSyncPageMetadata {
  hash: string;
  title: string;
  content: string;
}

@Injectable()
/**
 * Syncs content from Discourse to Discord.
 */
export class DiscourseSyncProvider {
  readonly #discord: Client;
  readonly #logger = new Logger(DiscourseSyncProvider.name);
  readonly #discourse: DiscourseProvider;
  readonly #syncCategory?: number;

  constructor(
    configService: ConfigService,
    @InjectDiscordClient() discordClient: Client,
    discourse: DiscourseProvider,
  ) {
    const syncCategory = configService.get<string>('DISCOURSE_SYNC_CATEGORY');

    if (!syncCategory) {
      this.#logger.warn(
        'Discourse sync category not configured, syncing will be disabled.',
      );
    } else {
      const category = Number.parseInt(syncCategory, 10);

      if (
        Number.isNaN(category) ||
        category <= 0 ||
        !Number.isSafeInteger(category)
      ) {
        this.#logger.error(
          `Invalid DISCOURSE_SYNC_CATEGORY value: ${syncCategory}`,
        );
      } else {
        this.#syncCategory = category;
      }
    }

    this.#discourse = discourse;
    this.#discord = discordClient;
  }

  get isConfigured(): boolean {
    return Boolean(
      this.#discourse.isConfigured && this.#syncCategory !== undefined,
    );
  }

  #getConfig(markdown: string): DiscourseSyncPageMetadata | undefined {
    // Find the first YAML code block in the markdown content.
    const match = markdown.match(/```yaml\n([\s\S]+?)\n```/);

    if (!match) {
      return;
    }

    const yaml = match[1];
    const metadata = YAML.parse(yaml);

    return {
      guild: metadata.guild,
      thread: metadata.thread ?? false,
      channel: metadata.channel,
      webhook: metadata.webhook,
    };
  }

  /**
   * Gets pages from Discourse that need to be synced with Discord.
   * @returns A list of pages to sync.
   */
  async getPagesToSync(): Promise<DiscourseSyncPage[]> {
    if (!this.#discourse.client || this.#syncCategory === undefined) {
      return [];
    }

    const topicPartials = await this.#discourse.client.getTopicItemsOfCategory(
      this.#syncCategory,
    );

    if (!topicPartials.length) {
      return [];
    }

    const limit = pLimit(5);

    const syncPages = await Promise.all(
      topicPartials.map((topic) =>
        limit(async () => {
          const postItem = (await this.#discourse.client?.getTopic(topic.id))
            ?.post_stream.posts[0];

          if (!postItem) {
            return;
          }

          const post = await this.#discourse.client?.getPost(postItem.id);

          if (!post) {
            return;
          }

          const config = this.#getConfig(post.raw);

          if (!config) {
            return;
          }

          const hash = post.id.toString();

          let content = post.raw as string;

          // remove YAML config block
          content = content.replace(/```yaml\n([\s\S]+?)\n```/, '');

          const guild = this.#discord.guilds.cache.get(config.guild);
          const combinedRegex =
            /(?:\[#(?:[^\s\[\]\(\)]+?)\]\(((?:https:\/\/discord\.com\/channels\/(\d+)\/(\d+)))\))|(?:\[((https:\/\/discord\.com\/channels\/(\d+)\/(\d+))|#([^\s]+?))\]\(\5\))|(https:\/\/discord\.com\/channels\/(\d+)\/(\d+))|(:([a-zA-Z0-9_]+):)|(?:\[(https?:\/\/[^\s\[\]\(\)]+)\]\(\14\/?\))|((https?:\/\/[^\s\[\]\(\)]+))/g;

          // Use a function to determine the replacement dynamically
          content = content.replace(
            combinedRegex,
            (
              match,
              _p1,
              p2,
              p3,
              _p4,
              _p5,
              p6,
              p7,
              _p8,
              _p9,
              p10,
              p11,
              _p12,
              p13,
              p14,
              _p15,
              p16,
            ) => {
              if (p3 || p7 || p11) {
                // Discord channel URL
                // p3, p7, or p11 - channel ID
                // p2, p6, or p10 - guild ID
                const guildId = p2 ?? p6 ?? p10;
                const channelId = p3 ?? p7 ?? p11;
                const sameGuild = guildId === config?.guild;

                return sameGuild
                  ? channelMention(channelId)
                  : channelLink(guildId, channelId);
              } else if (p14 || p16) {
                // URL, or URL with duplicate link text and URL (e.g. [link](link))
                return hideLinkEmbed(p14 ?? p16);
              } else if (p13) {
                // Emoji
                return (
                  guild?.emojis.cache.find((e) => e.name === p13)?.toString() ??
                  match
                );
              } else {
                // No match
                return match;
              }
            },
          );

          return {
            hash,
            title: topic.title,
            content,
            ...config,
          };
        }),
      ),
    );

    return syncPages.filter((page): page is DiscourseSyncPage => Boolean(page));
  }
}
