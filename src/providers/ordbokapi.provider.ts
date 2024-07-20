import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as levenshtein from 'fast-levenshtein';
import { request, gql } from 'graphql-request';
import {
  Dictionary,
  RandomWordDefinitionsQuery,
  WordClass,
  WordDefinitionsQuery,
  WordDefinitionsQueryVariables,
  WordInflectionsQuery,
  WordInflectionsQueryVariables,
  SuggestionsQuery,
  SuggestionsQueryVariables,
} from '../gql/graphql.js';

@Injectable()
export class OrdbokApiProvider {
  readonly #endpoint: string;

  constructor(configService: ConfigService) {
    this.#endpoint =
      configService.get<string>('ORDBOKAPI_ENDPOINT') ??
      'https://api.ordbokapi.org/graphql';
  }

  /**
   * Retrieves the definitions of a word from the specified dictionaries.
   *
   * @param word The word to retrieve definitions for.
   * @param dictionaries The dictionaries to search for definitions in.
   * @param wordClass The word class to filter definitions by.
   * @returns An array of articles containing the word's definitions.
   */
  async definitions(
    word: string,
    dictionaries: Dictionary[],
    wordClass?: WordClass,
  ): Promise<
    NonNullable<NonNullable<WordDefinitionsQuery['word']>['articles']>
  > {
    const query = gql`
      query WordDefinitions(
        $word: String!
        $dictionaries: [Dictionary!]
        $wordClass: WordClass
      ) {
        word(word: $word, dictionaries: $dictionaries, wordClass: $wordClass) {
          articles {
            id
            dictionary
            lemmas {
              lemma
              splitInfinitive
              paradigms {
                inflections {
                  tags
                  wordForm
                }
                tags
              }
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
    `;

    const data = await request<
      WordDefinitionsQuery,
      WordDefinitionsQueryVariables
    >(this.#endpoint, query, { word, dictionaries, wordClass });

    return data.word?.articles ?? [];
  }

  /**
   * Retrieves the definitions of a random word from the specified dictionary.
   *
   * @param word The word to retrieve definitions for.
   * @param dictionary The dictionary to search for definitions in.
   * @returns An article containing the word's definitions.
   */
  async randomDefinition(
    dictionary: Dictionary,
  ): Promise<RandomWordDefinitionsQuery['randomArticle']> {
    const query = gql`
      query RandomWordDefinitions($dictionary: Dictionary!) {
        randomArticle(dictionary: $dictionary) {
          id
          dictionary
          lemmas {
            lemma
            splitInfinitive
            paradigms {
              inflections {
                tags
                wordForm
              }
              tags
            }
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
    `;

    const data = await request<RandomWordDefinitionsQuery>(
      this.#endpoint,
      query,
      {
        dictionary,
      },
    );

    return data.randomArticle;
  }

  /**
   * Retrieves inflections of a word from the specified dictionaries.
   * @param word The word to retrieve inflections for.
   * @param dictionaries The dictionaries to search for inflections in.
   * @param wordClass The word class to filter inflections by.
   * @returns A promise that resolves to an array of inflection objects.
   */
  async inflections(
    word: string,
    dictionaries: Dictionary[],
    wordClass?: WordClass,
  ): Promise<
    NonNullable<NonNullable<WordInflectionsQuery['word']>['articles']>
  > {
    const query = gql`
      query WordInflections(
        $word: String!
        $dictionaries: [Dictionary!]
        $wordClass: WordClass
      ) {
        word(word: $word, dictionaries: $dictionaries, wordClass: $wordClass) {
          articles {
            id
            dictionary
            wordClass
            gender
            lemmas {
              lemma
              splitInfinitive
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
    `;

    const data = await request<
      WordInflectionsQuery,
      WordInflectionsQueryVariables
    >(this.#endpoint, query, { word, dictionaries, wordClass });

    return data.word?.articles ?? [];
  }

  /**
   * Retrieves a list of suggestions for a query.
   * @param text The query to get suggestions for.
   * @param dictionaries The dictionaries to search for suggestions in.
   * @returns A promise that resolves to an array of suggestions.
   */
  async suggestions(
    text: string,
    dictionaries: Dictionary[],
  ): Promise<string[]> {
    const query = gql`
      query Suggestions($text: String!, $dictionaries: [Dictionary!]) {
        suggestions(word: $text, dictionaries: $dictionaries) {
          exact {
            word
          }
          similar {
            word
          }
          freetext {
            word
          }
        }
      }
    `;

    const data = await request<SuggestionsQuery, SuggestionsQueryVariables>(
      this.#endpoint,
      query,
      { text, dictionaries },
    );

    const suggestions = new Set<string>();

    for (const list of [
      data.suggestions.exact,
      data.suggestions.similar,
      data.suggestions.freetext,
    ]) {
      for (const suggestion of list) {
        suggestions.add(suggestion.word);
      }
    }

    // Sort the suggestions by their Levenshtein distance to the query.

    return [...suggestions].sort((a, b) => {
      const distanceA = levenshtein.get(text, a, { useCollator: true });
      const distanceB = levenshtein.get(text, b, { useCollator: true });

      return distanceA - distanceB;
    });
  }
}
