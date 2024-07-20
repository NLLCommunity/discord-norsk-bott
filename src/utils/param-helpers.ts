import { Param, ParamType, Choice } from '@discord-nestjs/core';
import { WordClass, Dictionary } from '../gql/graphql.js';
import { Union } from './decorator-union.js';
import { ParamOptions } from '@discord-nestjs/core/dist/decorators/option/param/param-options.js';

/**
 * Adds an "ord" option to the command.
 */
export const WordParam = () =>
  Param({
    name: 'ord',
    description: 'Ordet du vil søkja etter / The word you want to search for',
    type: ParamType.STRING,
    required: true,
  });

/**
 * Adds an "ordbok" option to the command.
 */
export const DictParam = (options: Partial<ParamOptions> = {}) =>
  Union(
    Param({
      name: 'ordbok',
      description:
        'Ordboka du vil søkja i / The dictionary you want to search in',
      type: ParamType.STRING,
      required: false,
      ...options,
    }),
    Choice(
      Object.entries(Dictionary).reduce(
        (acc, [key, value]) => {
          let dict = '';

          switch (key) {
            case Dictionary.Bokmaalsordboka:
              dict = 'bokmål';
              break;
            case Dictionary.Nynorskordboka:
              dict = 'nynorsk';
              break;
            case Dictionary.NorskOrdbok:
              dict = 'norsk';
              break;
            default:
              dict = key;
              break;
          }

          return {
            ...acc,
            [dict]: value,
          };
        },
        {} as Record<keyof typeof Dictionary, string>,
      ),
    ),
  );

/**
 * Adds an "ordklasse" option to the command.
 */
export const WordClassParam = () =>
  Union(
    Param({
      name: 'ordklasse',
      description:
        'Ordklassen du vil søkja etter / The word class you want to search for',
      type: ParamType.STRING,
      required: false,
    }),
    Choice(WordClass),
  );

/**
 * Adds a "vistilalle" option to the command.
 */
export const ShowEveryoneParam = () =>
  Param({
    name: 'vistilalle',
    description:
      'Send svaret i kanalen for alle å sjå / Send the response in the channel for everyone to see',
    type: ParamType.BOOLEAN,
    required: false,
  });

/**
 * Adds a "showeveryone" option to the command.
 */
export const ShowEveryoneParamEn = () =>
  Param({
    name: 'showeveryone',
    description: 'Send the response in the channel for everyone to see',
    type: ParamType.BOOLEAN,
    required: false,
  });
