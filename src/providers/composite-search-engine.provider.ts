import { Injectable, Logger } from '@nestjs/common';
import {
  SearchEngineProvider,
  SearchResult,
} from './search-engine.provider.js';
import { BingProvider } from './bing.provider.js';
import { BraveProvider } from './brave.provider.js';

@Injectable()
export class CompositeSearchEngineProvider implements SearchEngineProvider {
  readonly #logger = new Logger(CompositeSearchEngineProvider.name);
  #provider?: SearchEngineProvider;

  constructor(
    private readonly bingProvider: BingProvider,
    private readonly braveProvider: BraveProvider,
  ) {
    if (this.bingProvider.isAvailable) {
      this.#provider = this.bingProvider;
    } else if (this.braveProvider) {
      this.#provider = this.braveProvider;
    }

    if (!this.#provider) {
      this.#logger.warn(
        'No search engine providers are available during initialization',
      );
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    if (this.#provider) {
      const results = await this.#provider.search(query);

      this.#logger.verbose(
        `Returning search results from ${this.#provider.constructor.name}`,
        results,
      );

      return results;
    }

    this.#logger.warn(
      `No search engine provider available for query: ${query}`,
    );
    return [];
  }
}
