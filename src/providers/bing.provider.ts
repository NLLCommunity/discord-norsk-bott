import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SearchEngineProvider,
  SearchResult,
} from './search-engine.provider.js';

@Injectable()
export class BingProvider implements SearchEngineProvider {
  readonly #logger = new Logger(BingProvider.name);
  readonly #apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('BING_API_KEY');
    this.#apiKey = key;
  }

  get isAvailable(): boolean {
    return Boolean(this.#apiKey);
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.#apiKey) {
      this.#logger.error('Bing API key not found');
      return [];
    }

    const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(endpoint, {
        headers: { 'Ocp-Apim-Subscription-Key': this.#apiKey },
      });
      const data = await response.json();
      if (data.webPages && data.webPages.value) {
        return data.webPages.value.map((item: any) => ({
          title: item.name,
          url: item.url,
        }));
      }
      return [];
    } catch (error) {
      this.#logger.error('Error fetching Bing search results', error);
      return [];
    }
  }
}
