/**
 * @typedef {Object} TextContent
 * @property {string} textContent The content of the text.
 */

/**
 * @typedef {Object} BareLemma
 * @property {string} lemma The lemma of the word.
 */

/**
 * Gender enum
 * @readonly
 * @enum {string}
 */
export const Gender = {
  Hankjønn: 'Hankjoenn',
  Hokjønn: 'Hokjoenn',
  HankjønnHokjønn: 'HankjoennHokjoenn',
  Inkjekjønn: 'Inkjekjoenn',
};

/**
 * @typedef {Object} DefinitionArticle
 * @property {string} id The ID of the article.
 * @property {BareLemma[]} lemmas The lemmas of the word.
 * @property {Definition[]} definitions The definitions of the word.
 * @property {string} wordClass The word class of the word.
 * @property {Gender} [gender] The gender of the word.
 * @property {Dictionary} dictionary The dictionary the article is from.
 */

/**
 * @typedef {Object} Definition
 * @property {TextContent[]} content The content of the definition.
 * @property {TextContent[]} examples The examples of the definition.
 */

/**
 * @typedef {Object} InflectionArticle
 * @property {string} id The ID of the article.
 * @property {InflectionLemma[]} lemmas The lemmas of the word.
 */

/**
 * @typedef {Object} InflectionLemma
 * @property {string} lemma The lemma of the word.
 * @property {InflectionParadigm[]} paradigms The paradigms of the word.
 */

/**
 * @typedef {Object} InflectionParadigm
 * @property {string[]} tags The tags of the paradigm.
 * @property {Inflection[]} inflections The inflections of the paradigm.
 */

/**
 * @typedef {Object} Inflection
 * @property {string[]} tags The tags of the inflection.
 * @property {string} wordForm The word form of the inflection.
 */

/**
 * Dictionary enum
 * @readonly
 * @enum {string}
 */
export const Dictionary = {
  Bokmål: 'Bokmaalsordboka',
  Nynorsk: 'Nynorskordboka',
};

/**
 * Provider for the Ordbok API
 */
export class OrdbokApiService {
  constructor() {
    this.url = 'https://api.ordbokapi.org/graphql';
  }

  async fetch(query, variables) {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json();

    if (json.errors) {
      throw new Error(json.errors[0].message);
    }

    return json;
  }

  /**
   * Retrieves the definitions of a word from the specified dictionaries.
   *
   * @param {string} word The word to retrieve definitions for.
   * @param {Dictionary[]} dictionaries The dictionaries to search for definitions in.
   * @returns {Promise<DefinitionArticle[]>} An array of articles containing the word's definitions.
   */
  async definitions(word, dictionaries) {
    const response = await this.fetch(
      `
      query WordDefinitions($word: String!, $dictionaries: [Dictionary!]) {
        word(word: $word, dictionaries: $dictionaries) {
          articles {
            id
            dictionary
            lemmas {
              lemma
            }
            gender
            wordClass
            definitions {
              content {
                textContent
              }
              examples {
                textContent
              }
            }
          }
        }
      }
    `,
      { word, dictionaries }
    );

    return response.data.word?.articles ?? [];
  }

  /**
   * Retrieves inflections of a word from the specified dictionaries.
   * @param {string} word The word to retrieve inflections for.
   * @param {Dictionary[]} dictionaries The dictionaries to search for inflections in.
   * @returns {Promise<InflectionArticle[]>} A promise that resolves to an array of inflection objects.
   */
  async inflections(word, dictionaries) {
    const response = await this.fetch(
      `
      query WordInflections($word: String!, $dictionaries: [Dictionary!]) {
        word(word: $word, dictionaries: $dictionaries) {
          articles {
            id
            dictionary
            lemmas {
              lemma
              paradigms {
                inflections {
                  tags
                  wordForm
                }
                tags
              }
            }
          }
        }
      }
    `,
      { word, dictionaries }
    );

    return response.data.word.articles;
  }
}
