/**
 * An individual search result.
 */
export interface SearchResult {
  title: string;
  url: string;
}

/**
 * Returns a list of search results based on the query.
 */
export interface SearchEngineProvider {
  /**
   * Searches for results based on the query.
   * @param query The search query.
   * @returns A list of search results.
   */
  search(query: string): Promise<SearchResult[]>;
}
