import { Injectable } from '@nestjs/common';
import { Dictionary, Gender, WordDefinitionsQuery } from '../gql/graphql';
import { EmbedBuilder } from 'discord.js';
import { InflectionFormatterProvider } from './inflection-formatter.provider';

/**
 * Formats common data types for display in Discord.
 */
@Injectable()
export class FormatterProvider {
  constructor(
    private readonly inflectionFormatter: InflectionFormatterProvider,
  ) {}

  /**
   * Formats a dictionary.
   * @param dictionary The dictionary to format.
   */
  formatDictionary(dictionary: Dictionary): string {
    switch (dictionary) {
      case Dictionary.Bokmaalsordboka:
        return 'Bokmålsordboka';

      case Dictionary.Nynorskordboka:
        return 'Nynorskordboka';

      case Dictionary.NorskOrdbok:
        return 'Norsk Ordbok';

      default:
        return dictionary;
    }
  }

  /**
   * Formats a grammatical gender.
   * @param gender The gender to format.
   */
  formatGender(gender: Gender): string {
    switch (gender) {
      case Gender.Hankjoenn:
        return 'hankjønn';

      case Gender.Hokjoenn:
        return 'hokjønn';

      case Gender.HankjoennHokjoenn:
        return 'hankjønn/hokjønn';

      case Gender.Inkjekjoenn:
        return 'inkjekjønn';

      default:
        return gender;
    }
  }

  /**
   * Returns a URL to the given article on ordbokene.no.
   * @param article The article to get the URL for.
   */
  getUrl(article: { id: number; dictionary: Dictionary }): string {
    if (article.dictionary === Dictionary.NorskOrdbok) {
      return '';
    }

    return `https://ordbokene.no/${
      article.dictionary === Dictionary.Bokmaalsordboka ? 'bm' : 'nn'
    }/${article.id}`;
  }

  /**
   * Returns an embed for the given dictionary article.
   * @param article The article to get the embed for.
   */
  embedForArticle(
    article: NonNullable<
      NonNullable<WordDefinitionsQuery['word']>['articles']
    >[0],
    fallbackWord?: string,
  ): EmbedBuilder {
    const definitions =
      article.definitions
        ?.map(
          (definition, definitionIndex) =>
            `${definitionIndex + 1}. ` +
            definition.content.map((c) => c.textContent).join('; '),
        )
        .join('\n') ?? '';

    const genderString = article.gender
      ? `, ${this.formatGender(article.gender)}`
      : '';

    const title =
      article.lemmas?.reduce((acc, lemma) => {
        const lemmaText =
          article.wordClass === 'Verb' ? `å ${lemma.lemma}` : lemma.lemma;
        return acc ? `${acc}, ${lemmaText}` : lemmaText;
      }, '') ??
      fallbackWord ??
      '[Ukjent ord]';

    const url = this.getUrl(article);
    const dictionaryText = url
      ? `[_frå ${this.formatDictionary(article.dictionary)}_](${url})`
      : `_frå ${this.formatDictionary(article.dictionary)}_`;

    let articleHeader = `${article.wordClass}${genderString}\n${dictionaryText}`;

    let splitInfinitive = false;

    const lemmas = article.lemmas ?? [];

    const inflections: string[] = [];

    for (const lemma of lemmas ?? []) {
      if (lemma.splitInfinitive) {
        splitInfinitive = true;
      }

      for (const paradigm of lemma.paradigms) {
        let text = '';

        const { groups, full: showLong } =
          this.inflectionFormatter.formatInflections({
            article,
            paradigm,
          });

        if (!showLong) {
          for (const inflections of groups) {
            let formList = '';

            for (const { forms } of inflections) {
              formList += formList ? `; ${forms}` : forms;
            }

            text += `> ${formList}\n`;
          }
        }

        const trimmed = text.trim();

        if (!trimmed || inflections.includes(trimmed)) {
          continue;
        }

        inflections.push(trimmed);
      }
    }

    if (splitInfinitive) {
      articleHeader += '\n\nKløyvd infinitiv: -a\n';
    }

    if (inflections.length) {
      articleHeader += `\n${inflections.join('\n')}\n`;
    }

    const body = `${articleHeader}\n${definitions}`;

    const embed = new EmbedBuilder().setTitle(title).setDescription(body);

    return embed;
  }
}
