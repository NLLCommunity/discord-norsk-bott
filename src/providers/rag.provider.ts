import { Inject, Injectable, Logger } from '@nestjs/common';
import { load as cheerioLoad } from 'cheerio';
import { OpenAiProvider } from './openai.provider.js';
import {
  SearchEngineProvider,
  SearchResult,
} from './search-engine.provider.js';

export interface RagContext {
  summary: string;
  url: string;
  embedding: number[];
}

@Injectable()
export class RagProvider {
  readonly #logger = new Logger(RagProvider.name);

  constructor(
    @Inject('ISearchEngineProvider')
    private readonly searchEngineProvider: SearchEngineProvider,
    private readonly openAiProvider: OpenAiProvider,
  ) {}

  /**
   * Given a query, this method retrieves context using a RAG pipeline:
   * 1. Searches for top results using the search engine provider.
   * 2. Fetches each page's content, extracts and summarizes the text.
   * 3. Computes embeddings and selects the most relevant context.
   *
   * @param query The user's query.
   * @param prompt Optional instructions for the summarization model.
   * @returns The most relevant context for the query.
   */
  async retrieveContext(query: string, prompt?: string): Promise<RagContext> {
    const searchResults = await this.#searchEngine(query);
    const resultContexts = await Promise.all(
      searchResults.slice(0, 5).map(async (result: SearchResult) => {
        const html = await this.#fetchPageContent(result.url);
        const text = this.#extractMainText(html);
        const summary = await this.#summarizeText(
          text,
          prompt ||
            `You are summarizing a page from ${result.url}. It was found by searching for "${query}". Your summary should be concise and relevant to the query. If the query is trying to find answers to a question and the answer is found in the text, please focus on summarizing the answer.`,
        );
        return { summary, url: result.url };
      }),
    );

    const queryEmbedding = await this.#getEmbedding(query);
    const summariesWithEmbedding = await Promise.all(
      resultContexts.map(async (ctx) => ({
        ...ctx,
        embedding: await this.#getEmbedding(ctx.summary),
      })),
    );

    let bestMatch = summariesWithEmbedding[0];
    let bestScore = this.#cosineSimilarity(queryEmbedding, bestMatch.embedding);
    for (let i = 1; i < summariesWithEmbedding.length; i++) {
      const score = this.#cosineSimilarity(
        queryEmbedding,
        summariesWithEmbedding[i].embedding,
      );
      if (score > bestScore) {
        bestScore = score;
        bestMatch = summariesWithEmbedding[i];
      }
    }

    this.#logger.verbose(
      `Best match for query "${query}" is from ${bestMatch.url}, with a score of ${bestScore}. Summary: ${bestMatch.summary}`,
    );

    return bestMatch;
  }

  /**
   * Delegates to the search engine provider.
   *
   * @param query The search query.
   * @returns An array of search results.
   */
  async #searchEngine(query: string): Promise<SearchResult[]> {
    return await this.searchEngineProvider.search(query);
  }

  /**
   * Retrieves the raw HTML for a URL.
   *
   * @param url The URL to fetch.
   * @returns The HTML content as a string.
   */
  async #fetchPageContent(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      return await res.text();
    } catch (error) {
      this.#logger.error(`Error fetching content from ${url}`, error);
      return '';
    }
  }

  /**
   * Uses Cheerio to remove boilerplate and extract body text.
   *
   * @param html The raw HTML content.
   * @returns The extracted text.
   */
  #extractMainText(html: string): string {
    const $ = cheerioLoad(html);
    $('script, style, noscript').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  }

  /**
   * Sends the text to OpenAI's Chat API for summarization.
   *
   * @param text The text to summarize.
   * @param prompt The prompt to instruct summarization.
   * @returns The summarized text.
   */
  async #summarizeText(text: string, prompt: string): Promise<string> {
    const fullPrompt = `${prompt}\n\nYour response should be concise and less than 800 tokens.\n\nText to summarize:\n\n${text}`;
    try {
      const response =
        await this.openAiProvider.client!.chat.completions.create({
          model: 'o3-mini',
          reasoning_effort: 'low',
          messages: [
            {
              role: 'developer',
              content: `You are a helpful summarization assistant.`,
            },
            { role: 'user', content: fullPrompt },
          ],
        });
      const summary = response.choices[0].message?.content?.trim();
      const trimmed =
        summary || text.substring(0, 800) + (text.length > 800 ? '...' : '');

      this.#logger.verbose(`Summarized text: ${trimmed}`);
      return trimmed;
    } catch (error) {
      this.#logger.error('Error during summarization', error);
      return text.substring(0, 800) + (text.length > 800 ? '...' : '');
    }
  }

  /**
   * Calls OpenAI's embeddings API and retrieves the embedding for the text.
   *
   * @param text The text to generate embeddings for.
   * @returns An array representing the embedding.
   */
  async #getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openAiProvider.client!.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 3072,
      });
      if (response.data && response.data.length > 0) {
        return response.data[0].embedding;
      }
      return [];
    } catch (error) {
      this.#logger.error('Error getting embedding', error);
      return Array(3072).fill(0);
    }
  }

  /**
   * Computes cosine similarity between two vectors, used to compare embeddings.
   *
   * @param vecA The first vector.
   * @param vecB The second vector.
   * @returns The cosine similarity score.
   */
  #cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dot = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dot / (magA * magB);
  }
}
