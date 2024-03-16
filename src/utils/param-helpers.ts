import { Param, ParamType, Choice } from '@discord-nestjs/core';
import { WordClass, Dictionary } from 'src/gql/graphql';
import { Union } from './decorator-union';

/**
 * Adds an "ord" option to the command.
 */
export const WordParam = () =>
  Param({
    name: 'ord',
    description: 'Ordet du vil søkja etter',
    type: ParamType.STRING,
    required: true,
  });

/**
 * Adds an "ordbok" option to the command.
 */
export const DictParam = () =>
  Union(
    Param({
      name: 'ordbok',
      description: 'Ordboka du vil søkja i',
      type: ParamType.STRING,
      required: false,
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
      description: 'Ordklassen du vil søkja etter',
      type: ParamType.STRING,
      required: false,
    }),
    Choice(WordClass),
  );

/**
 * Adds a "privat" option to the command.
 */
export const PrivateParam = () =>
  Param({
    name: 'privat',
    description: 'Om du vil ha svar berre du kan sjå',
    type: ParamType.BOOLEAN,
    required: false,
  });
