import { Param, ParamType, Choice } from '@discord-nestjs/core';
import { WordClass, Dictionary } from 'src/gql/graphql';
import { Union } from './decorator-union';

/**
 * Adds a "ord" option to the command.
 */
export const WordParam = () =>
  Param({
    name: 'ord',
    description: 'Ordet du vil søkja etter',
    type: ParamType.STRING,
    required: true,
  });

/**
 * Adds a "ordbok" option to the command.
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
        (acc, [key, value]) => ({
          ...acc,
          [key === Dictionary.Bokmaalsordboka
            ? 'bokmål'
            : key === Dictionary.Nynorskordboka
              ? 'nynorsk'
              : key]: value,
        }),
        {} as Record<keyof typeof Dictionary, string>,
      ),
    ),
  );

/**
 * Adds a "ordklasse" option to the command.
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
