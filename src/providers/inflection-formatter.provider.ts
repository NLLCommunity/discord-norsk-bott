import { Injectable } from '@nestjs/common';
import {
  Dictionary,
  Gender,
  InflectionTag,
  WordClass,
  WordInflectionsQuery,
} from '../gql/graphql';

type InflectionsQueryArticle = NonNullable<
  NonNullable<WordInflectionsQuery['word']>['articles']
>[0];
type InflectionsQueryParadigm = NonNullable<
  InflectionsQueryArticle['lemmas']
>[0]['paradigms'][0];
type InflectionsQueryInflections = NonNullable<
  InflectionsQueryParadigm['inflections']
>;

const indefiniteArticles = {
  [Dictionary.Bokmaalsordboka]: {
    [Gender.Hankjoenn]: 'en',
    [Gender.HankjoennHokjoenn]: 'en/ei',
    [Gender.Hokjoenn]: 'ei',
    [Gender.Inkjekjoenn]: 'et',
  },
  [Dictionary.Nynorskordboka]: {
    [Gender.Hankjoenn]: 'ein',
    [Gender.HankjoennHokjoenn]: 'ein/ei',
    [Gender.Hokjoenn]: 'ei',
    [Gender.Inkjekjoenn]: 'eit',
  },
};

type GroupedInflections = Map<
  string,
  { tags: Set<InflectionTag>; wordForms: string[] }
>;

interface HandlerOptions {
  groupedInflections: GroupedInflections;
  article: InflectionsQueryArticle;
  paradigm: InflectionsQueryParadigm;
}

interface InflectionConfig {
  name: string;
  includeTags: InflectionTag[];
  excludeTags?: InflectionTag[];
  prefix?: string;
  suffix?: string;
}

export interface FormattedInflection {
  name: string;
  forms: string;
}

export interface FormattedInflections {
  groups: FormattedInflection[][];
  full: boolean;
}

export interface InflectionFormatterOptions {
  article: InflectionsQueryArticle;
  paradigm: InflectionsQueryParadigm;
  full?: boolean;
}

type WordClassHandlers = Partial<{
  [K in WordClass]: (options: HandlerOptions) => FormattedInflection[][];
}>;

const wordClassHandlers: WordClassHandlers = {
  [WordClass.Verb]: ({ groupedInflections }) => {
    const groupConfigs: InflectionConfig[][] = [
      [
        {
          name: 'infinitiv',
          includeTags: [InflectionTag.Infinitiv],
          excludeTags: [InflectionTag.Passiv, InflectionTag.Adjektiv],
          prefix: '_å_ ',
        },
        {
          name: 'presens',
          includeTags: [InflectionTag.Presens],
          excludeTags: [InflectionTag.Passiv, InflectionTag.Adjektiv],
        },
        {
          name: 'preteritum',
          includeTags: [InflectionTag.Preteritum],
          excludeTags: [InflectionTag.Passiv, InflectionTag.Adjektiv],
        },
        {
          name: 'presens perfektum',
          includeTags: [InflectionTag.PerfektPartisipp],
          excludeTags: [InflectionTag.Passiv, InflectionTag.Adjektiv],
          prefix: '_har_ ',
        },
        {
          name: 'imperativ',
          includeTags: [InflectionTag.Imperativ],
          suffix: '_!_',
        },
        {
          name: 'presens partisipp',
          includeTags: [InflectionTag.PresensPartisipp],
        },
      ],
    ];
    return processForms(groupedInflections, groupConfigs);
  },
  [WordClass.Substantiv]: ({ groupedInflections, article, paradigm }) => {
    const gender =
      Object.values(Gender).find((g) =>
        paradigm.tags.includes(g as unknown as InflectionTag),
      ) ?? article.gender;

    const articleDictionary =
      article.dictionary === Dictionary.Bokmaalsordboka
        ? Dictionary.Bokmaalsordboka
        : Dictionary.Nynorskordboka;
    const indefiniteArticle =
      gender && indefiniteArticles[articleDictionary][gender];

    const groupConfigs: InflectionConfig[][] = [
      [
        {
          name: 'ubestemt eintal',
          includeTags: [InflectionTag.Eintal, InflectionTag.Ubestemt],
          prefix: `_${indefiniteArticle}_ `,
        },
        {
          name: 'bestemt eintal',
          includeTags: [InflectionTag.Bestemt, InflectionTag.Eintal],
        },
        {
          name: 'ubestemt fleirtal',
          includeTags: [InflectionTag.Fleirtal, InflectionTag.Ubestemt],
        },
        {
          name: 'bestemt fleirtal',
          includeTags: [InflectionTag.Bestemt, InflectionTag.Fleirtal],
        },
      ],
    ];
    return processForms(groupedInflections, groupConfigs);
  },
  [WordClass.Adjektiv]: ({ groupedInflections }) => {
    const groupConfigs: InflectionConfig[][] = [
      [
        {
          name: 'ubestemt eintal',
          includeTags: [InflectionTag.Eintal, InflectionTag.Hankjoenn],
        },
        {
          name: 'ubestemt eintal',
          includeTags: [InflectionTag.Eintal, InflectionTag.Hokjoenn],
        },
        {
          name: 'ubestemt eintal',
          includeTags: [InflectionTag.Eintal, InflectionTag.HankjoennHokjoenn],
        },
        {
          name: 'ubestemt eintal',
          includeTags: [InflectionTag.Eintal, InflectionTag.Inkjekjoenn],
        },
        {
          name: 'ubestemt fleirtal',
          includeTags: [InflectionTag.Fleirtal],
        },
        {
          name: 'bestemt eintal',
          includeTags: [InflectionTag.Eintal, InflectionTag.Bestemt],
        },
      ],
      [
        {
          name: 'komparativ',
          includeTags: [InflectionTag.Komparativ],
        },
        {
          name: 'ubestemt superlativ',
          includeTags: [InflectionTag.Superlativ, InflectionTag.Ubestemt],
        },
        {
          name: 'bestemt superlativ',
          includeTags: [InflectionTag.Superlativ, InflectionTag.Bestemt],
        },
      ],
    ];
    return processForms(groupedInflections, groupConfigs);
  },
};

function processForms(
  forms: GroupedInflections,
  groupConfigs: InflectionConfig[][],
): FormattedInflection[][] {
  const formatted: FormattedInflection[][] = new Array(groupConfigs.length)
    .fill(null)
    .map(() => []);

  for (const [, { tags, wordForms }] of forms) {
    for (const [index, configs] of groupConfigs.entries()) {
      const formattedGroup = formatted[index];

      for (const config of configs) {
        if (
          config.includeTags.every((tag) => tags.has(tag)) &&
          !config.excludeTags?.some((tag) => tags.has(tag))
        ) {
          formattedGroup.push({
            name: config.name,
            forms: wordForms
              .map((wf) => `${config.prefix ?? ''}${wf}${config.suffix ?? ''}`)
              .join(', '),
          });
        }
      }
    }
  }

  return formatted.filter((group) => group.length > 0);
}

@Injectable()
export class InflectionFormatterProvider {
  #groupInflections(
    inflections: InflectionsQueryInflections,
  ): GroupedInflections {
    return inflections.reduce((acc, inflection) => {
      const key = inflection.tags.sort().join('|');
      if (!acc.has(key)) {
        acc.set(key, {
          tags: new Set(inflection.tags),
          wordForms: [],
        });
      }
      acc.get(key)?.wordForms.push(inflection.wordForm ?? '');
      return acc;
    }, new Map() as GroupedInflections);
  }

  formatInflections({
    article,
    paradigm,
    full,
  }: InflectionFormatterOptions): FormattedInflections {
    const groupedInflections = this.#groupInflections(paradigm.inflections);
    const handler =
      !full && article.wordClass
        ? wordClassHandlers[article.wordClass]
        : undefined;

    if (!handler) {
      const formatted: FormattedInflection[] = [];

      for (const { tags, wordForms } of groupedInflections.values()) {
        formatted.push({
          name: [...tags].map(this.formatInflectionTag).join(', '),
          forms: wordForms.join(', '),
        });
      }

      return { groups: [formatted], full: true };
    }

    return {
      groups: handler({ groupedInflections, article, paradigm }),
      full: false,
    };
  }

  /**
   * Formats an inflection tag.
   * @param tag The tag to format.
   */
  formatInflectionTag(tag: InflectionTag): string {
    switch (tag) {
      case InflectionTag.Infinitiv:
        return 'infinitiv';

      case InflectionTag.Presens:
        return 'presens';

      case InflectionTag.Preteritum:
        return 'preteritum';

      case InflectionTag.PerfektPartisipp:
        return 'perfekt partisipp';

      case InflectionTag.PresensPartisipp:
        return 'presens partisipp';

      case InflectionTag.SPassiv:
        return 's-passiv';

      case InflectionTag.Imperativ:
        return 'imperativ';

      case InflectionTag.Passiv:
        return 'passiv';

      case InflectionTag.Adjektiv:
        return 'adjektiv';

      case InflectionTag.Adverb:
        return 'adverb';

      case InflectionTag.Eintal:
        return 'eintal';

      case InflectionTag.HankjoennHokjoenn:
        return 'hankjønn/hokjønn';

      case InflectionTag.Hankjoenn:
        return 'hankjønn';

      case InflectionTag.Hokjoenn:
        return 'hokjønn';

      case InflectionTag.Inkjekjoenn:
        return 'inkjekjønn';

      case InflectionTag.Ubestemt:
        return 'ubestemt';

      case InflectionTag.Bestemt:
        return 'bestemt';

      case InflectionTag.Fleirtal:
        return 'fleirtal';

      case InflectionTag.Superlativ:
        return 'superlativ';

      case InflectionTag.Komparativ:
        return 'komparativ';

      case InflectionTag.Positiv:
        return 'positiv';

      case InflectionTag.Nominativ:
        return 'nominativ';

      case InflectionTag.Akkusativ:
        return 'akkusativ';

      default:
        return tag;
    }
  }
}
