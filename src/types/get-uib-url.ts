import { Dictionary } from '../gql/graphql.js';

/**
 * Given a UiB article, this method retrieves the URL for the article. If the
 * dictionary is not recognized or has no public URL, an empty string is
 * returned.
 *
 * @param article The UiB article.
 * @returns The URL for the article.
 */
export function getUiBUrl<T extends { id: number; dictionary: Dictionary }>(
  article: T,
): string {
  switch (article.dictionary) {
    case Dictionary.Bokmaalsordboka:
      return `https://ordbokene.no/nob/bm/${article.id}`;
    case Dictionary.Nynorskordboka:
      return `https://ordbokene.no/nno/nn/${article.id}`;
    default:
      return '';
  }
}
