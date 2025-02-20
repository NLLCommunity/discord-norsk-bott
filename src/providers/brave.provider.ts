import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SearchEngineProvider,
  SearchResult,
} from './search-engine.provider.js';

@Injectable()
export class BraveProvider implements SearchEngineProvider {
  readonly #logger = new Logger(BraveProvider.name);
  readonly #apiEndpoint: string;
  readonly #apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('BRAVE_API_KEY');
    this.#apiKey = key;
    this.#apiEndpoint = 'https://api.search.brave.com/res/v1/web/search';
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.#apiKey) {
      this.#logger.error('Brave API key not found');
      return [];
    }

    const endpoint = `${this.#apiEndpoint}?q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.#apiKey,
        },
      });
      const data = await response.json();
      if (data.web && data.web.results) {
        return data.web.results.map((item: any) => ({
          title: item.title,
          url: item.url,
        }));
      }
      return [];
    } catch (error) {
      this.#logger.error('Error fetching Brave search results', error);
      return [];
    }
  }
}
