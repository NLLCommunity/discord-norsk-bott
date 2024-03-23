import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';
import {
  ListBlockChildrenResponse,
  PageObjectResponse,
  PartialPageObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { NotionToMarkdown } from 'notion-to-md';
import * as YAML from 'yaml';
import * as crypto from 'crypto';

export interface SyncPageMetadata {
  guild: string;
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

  constructor(configService: ConfigService) {
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

      const line = await this.#markdownify?.blockToMarkdown(block);

      // replace markdown URLs to Discord channels with the syntax for Discord

      // e.g. [https://discord.com/channels/guildId/channelId](https://discord.com/channels/guildId/channelId)
      // or [#channel-name](https://discord.com/channels/guildId/channelId)
      // becomes <#channelId>
      const discordChannelRegex =
        /\[(?:(?:https:\/\/discord\.com\/channels\/\d+\/\d+)|(?:#([^]+?)))\]\(https:\/\/discord\.com\/channels\/\d+\/(\d+)\)/g;
      content = content.replace(discordChannelRegex, '<#$2>');

      // replace any that weren't in markdown format
      const discordChannelRegex2 =
        /https:\/\/discord\.com\/channels\/\d+\/(\d+)/g;
      content = content.replace(discordChannelRegex2, '<#$1>');

      if (line) {
        content += line + '\n';
      }
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
          ? Object.values(page.properties)
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
            'Untitled'
          : 'Unknown',
      content,
    };
  }

  async getPageContent(pageId: string): Promise<string> {
    if (!this.#client) {
      return '';
    }

    const blocks = await this.#client.blocks.children.list({
      block_id: pageId,
    });

    const content = await this.#blocksToMarkdown(blocks.results);
    return content;
  }

  async #blocksToMarkdown(
    blocks: ListBlockChildrenResponse['results'],
  ): Promise<string> {
    let content = '';

    for (const block of blocks) {
      const line = await this.#markdownify?.blockToMarkdown(block);

      if (line) {
        content += line + '\n';
      }
    }

    return content;
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
