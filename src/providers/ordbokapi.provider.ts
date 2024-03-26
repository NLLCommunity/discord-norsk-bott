import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request, gql } from 'graphql-request';
import {
  Dictionary,
  WordClass,
  WordDefinitionsQuery,
  WordDefinitionsQueryVariables,
  WordInflectionsQuery,
  WordInflectionsQueryVariables,
} from '../gql/graphql';

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
  ) {
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
}
