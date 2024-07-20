import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';
import {
  PageObjectResponse,
  PartialPageObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { NotionToMarkdown } from 'notion-to-md';
import * as YAML from 'yaml';
import * as crypto from 'crypto';
import {
  Client as DiscordClient,
  channelMention,
  channelLink,
  hideLinkEmbed,
} from 'discord.js';
import { InjectDiscordClient } from '@discord-nestjs/core';

export interface SyncPageMetadata {
  guild: string;
  thread: boolean;
  channel?: string;
  webhook?: string;
}

export interface SyncPage extends SyncPageMetadata {
  hash: string;
  title: string;
  content: string;
}

@Injectable()
export class NotionService {
  readonly #client?: Client;
  readonly #logger = new Logger(NotionService.name);
  readonly #markdownify?: NotionToMarkdown;

  constructor(
    configService: ConfigService,
    @InjectDiscordClient() private discordClient: DiscordClient,
  ) {
    const token = configService.get<string>('NOTION_TOKEN');

    if (!token) {
      return;
    }

    this.#client = new Client({ auth: token });
    this.#markdownify = new NotionToMarkdown({ notionClient: this.#client });
  }

  get isConfigured(): boolean {
    return Boolean(this.#client);
  }

  get client(): Client | undefined {
    return this.#client;
  }

  /**
   * Gets all pages that need to be synced with Discord.
   * @returns A list of pages to sync.
   */
  async getPagesToSync(): Promise<SyncPage[]> {
    if (!this.#client) {
      return [];
    }

    // Get all pages that the integration has access to

    // Filter out pages that don't have a code block that:
    //   - is in YAML format
    //   - has a `syncToDiscord` key set to `true`
    //   - has a `guild` key set to a guild ID
    //   - has a `channel` key set to a channel ID

    const syncPages: SyncPage[] = [];

    const response = await this.#client.search({
      filter: {
        property: 'object',
        value: 'page',
      },
    });

    for (const page of response.results) {
      if ('object' in page && page.object === 'page') {
        const pageId = page.id;

        this.#logger.verbose(`Checking page ${pageId}`);

        const syncPage = await this.#getSyncPage(page);

        if (syncPage) {
          this.#logger.verbose(`Found page to sync: ${syncPage.hash}`);
          syncPages.push(syncPage);
        }
      }
    }

    return syncPages;
  }

  async #getSyncPage(
    page: PageObjectResponse | PartialPageObjectResponse,
  ): Promise<SyncPage | undefined> {
    if (!this.#client) {
      return undefined;
    }

    // Get the blocks, then iterate until we find a code block with the info

    const blocks = await this.#client.blocks.children.list({
      block_id: page.id,
    });

    // Find the code block

    let syncPageMetadata: SyncPageMetadata | undefined = undefined;
    let content = '';

    for (const block of blocks.results) {
      if (!('type' in block)) {
        continue;
      }

      if (!syncPageMetadata) {
        if (block.type === 'code') {
          syncPageMetadata = this.#extractSyncMetadata(
            block.code.rich_text.reduce(
              (acc, text) => acc + text.plain_text,
              '',
            ),
          );
        }

        continue;
      }

      // Skip any child_page blocks
      if (block.type === 'child_page') {
        continue;
      }

      let line = await this.#markdownify?.blockToMarkdown(block);

      if (!line) {
        content += '\n';

        continue;
      }

      const guild = this.discordClient.guilds.cache.get(syncPageMetadata.guild);
      const combinedRegex =
        /(?:\[#(?:[^\s\[\]\(\)]+?)\]\(((?:https:\/\/discord\.com\/channels\/(\d+)\/(\d+)))\))|(?:\[((https:\/\/discord\.com\/channels\/(\d+)\/(\d+))|#([^\s]+?))\]\(\5\))|(https:\/\/discord\.com\/channels\/(\d+)\/(\d+))|(:([a-zA-Z0-9_]+):)|(?:\[(https?:\/\/[^\s\[\]\(\)]+)\]\(\14\/?\))|((https?:\/\/[^\s\[\]\(\)]+))/g;

      // Use a function to determine the replacement dynamically
      line = line.replace(
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
            const sameGuild = guildId === syncPageMetadata?.guild;

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

      content += line + '\n';
    }

    if (!syncPageMetadata) {
      return undefined;
    }

    // hash the page ID so that we don't post the ID directly to Discord
    const hash = crypto.createHash('md5').update(page.id).digest('hex');

    return {
      ...syncPageMetadata,
      hash,
      title:
        'properties' in page
          ? (Object.values(page.properties)
              .find(
                (
                  p,
                ): p is {
                  type: 'title';
                  title: RichTextItemResponse[];
                  id: string;
                } => 'title' in p,
              )
              ?.title.reduce((acc, text) => acc + text.plain_text, '') ??
            'Untitled')
          : 'Unknown',
      content,
    };
  }

  #extractSyncMetadata(code: string): SyncPageMetadata | undefined {
    try {
      const data = YAML.parse(code);

      if (
        typeof data === 'object' &&
        data.syncToDiscord === true &&
        typeof data.guild === 'string' &&
        (typeof data.channel === 'string' || typeof data.webhook === 'string')
      ) {
        return {
          guild: data.guild,
          thread: data.thread === true,
          channel: data.channel,
          webhook: data.webhook,
        };
      }
    } catch {
      // Ignore any errors
    }

    return undefined;
  }
}
