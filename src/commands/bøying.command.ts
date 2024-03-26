import { Injectable, Logger } from '@nestjs/common';
import {
  Command,
  Handler,
  InteractionEvent,
  Param,
  ParamType,
} from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  PaginationProvider,
  OrdbokApiProvider,
  FormatterProvider,
  RateLimiterProvider,
  ShowEveryoneProvider,
} from '../providers';
import {
  DictParam,
  WordParam,
  WordClassParam,
  ShowEveryoneParam,
} from '../utils';
import { DisplayLanguage } from '../types';
import { Dictionary, Gender, InflectionTag, WordClass } from '../gql/graphql';

export class BøyingCommandParams {
  @WordParam()
  word: string;

  @DictParam()
  dictionary?: Dictionary;

  @WordClassParam()
  wordClass?: WordClass;

  @ShowEveryoneParam()
  sendToEveryone?: boolean;

  @Param({
    name: 'full',
    description: 'Vis fullstendig bøying / Show full inflection',
    type: ParamType.BOOLEAN,
    required: false,
  })
  full?: boolean;
}

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

/**
 * A command for retrieving inflections of a word.
 */
@Injectable()
@Command({
  name: 'bøying',
  description: 'Søk etter bøying av ord / Search for inflections of a word',
})
export class BøyingCommand {
  constructor(
    private readonly pagination: PaginationProvider,
    private readonly ordbokApi: OrdbokApiProvider,
    private readonly formatter: FormatterProvider,
    private readonly rateLimiter: RateLimiterProvider,
    private readonly showEveryone: ShowEveryoneProvider,
  ) {}

  #logger = new Logger(BøyingCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { word, dictionary, wordClass, sendToEveryone, full }: BøyingCommandParams,
  ): Promise<void> {
    this.#logger.log(
      `Søkjer etter ${word} i ${dictionary} med ordklasse ${wordClass}`,
    );

    if (
      sendToEveryone &&
      this.rateLimiter.isRateLimited(BøyingCommand.name, interaction)
    ) {
      return;
    }

    await interaction.deferReply({
      ephemeral: !sendToEveryone,
    });

    try {
      const response = await this.ordbokApi.inflections(
        word,
        dictionary
          ? [dictionary]
          : [Dictionary.Bokmaalsordboka, Dictionary.Nynorskordboka],
        wordClass,
      );

      const embeds: EmbedBuilder[] = [];

      for (const article of response) {
        const fields = [];

        let splitInfinitive = false;

        const articleDictionary =
          article.dictionary === Dictionary.Bokmaalsordboka
            ? Dictionary.Bokmaalsordboka
            : Dictionary.Nynorskordboka;

        const genderString = article.gender
          ? `, ${this.formatter.formatGender(article.gender)}`
          : '';

        const lemmas = article.lemmas ?? [];

        for (const lemma of lemmas) {
          if (lemma.splitInfinitive) {
            splitInfinitive = true;
          }

          for (const [index, paradigm] of lemma.paradigms.entries()) {
            let text = '';
            if (index > 0) {
              text += '\n';
            }

            let paradigmText = '';

            if (paradigm.tags.length) {
              paradigmText =
                paradigm.tags
                  .map(this.formatter.formatInflectionTag)
                  .join(', ') + (lemmas.length > 1 ? ` (${lemma.lemma})` : '');
            } else {
              paradigmText =
                lemma.paradigms.length > 1
                  ? `Bøyingsmønster ${index + 1}${lemmas.length > 1 ? ` (${lemma.lemma})` : ''}`
                  : `Bøyingsmønster${lemmas.length > 1 ? ` (${lemma.lemma})` : ''}`;
            }

            const groupedInflections = paradigm.inflections.reduce(
              (acc, inflection) => {
                const key = inflection.tags.sort().join('|');
                if (!acc.has(key)) {
                  acc.set(key, {
                    tags: new Set(inflection.tags),
                    wordForms: [],
                  });
                }
                acc.get(key)?.wordForms.push(inflection.wordForm ?? '');
                return acc;
              },
              new Map<string, { tags: Set<string>; wordForms: string[] }>(),
            );

            if (full) {
              for (const { tags, wordForms } of groupedInflections.values()) {
                text += `${wordForms.join(', ')} (_${[...tags]
                  .map(this.formatter.formatInflectionTag)
                  .join(', ')}_)\n`;
              }
            } else {
              if (article.wordClass === WordClass.Verb) {
                let infinitive: string | undefined;
                let present: string | undefined;
                let past: string | undefined;
                let perfect: string | undefined;
                let imperative: string | undefined;
                let presentParticiple: string | undefined;

                for (const { tags, wordForms } of groupedInflections.values()) {
                  if (
                    tags.has(InflectionTag.Infinitiv) &&
                    !tags.has(InflectionTag.Passiv) &&
                    !tags.has(InflectionTag.Adjektiv)
                  ) {
                    infinitive = wordForms.map((wf) => `_å_ ${wf}`).join(', ');
                  } else if (
                    tags.has(InflectionTag.Presens) &&
                    !tags.has(InflectionTag.Passiv) &&
                    !tags.has(InflectionTag.Adjektiv)
                  ) {
                    present = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Preteritum) &&
                    !tags.has(InflectionTag.Passiv) &&
                    !tags.has(InflectionTag.Adjektiv)
                  ) {
                    past = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.PerfektPartisipp) &&
                    !tags.has(InflectionTag.Passiv) &&
                    !tags.has(InflectionTag.Adjektiv)
                  ) {
                    perfect = wordForms.map((wf) => `_har_ ${wf}`).join(', ');
                  } else if (tags.has(InflectionTag.Imperativ)) {
                    imperative = wordForms.map((wf) => `${wf}!`).join(', ');
                  } else if (tags.has(InflectionTag.PresensPartisipp)) {
                    presentParticiple = wordForms.join(', ');
                  }
                }

                const verbForms = [
                  infinitive,
                  present,
                  past,
                  perfect,
                  imperative,
                  presentParticiple,
                ].filter((f) => f);

                if (verbForms.length) {
                  text += verbForms.join('; ') + '\n';
                }
              } else if (article.wordClass === WordClass.Substantiv) {
                let singular: string | undefined;
                let plural: string | undefined;
                let definiteSingular: string | undefined;
                let definitePlural: string | undefined;

                const gender =
                  Object.values(Gender).find((g) =>
                    paradigm.tags.includes(g as unknown as InflectionTag),
                  ) ?? article.gender;

                const indefiniteArticle =
                  gender && indefiniteArticles[articleDictionary][gender];

                for (const { tags, wordForms } of groupedInflections.values()) {
                  if (
                    tags.has(InflectionTag.Eintal) &&
                    tags.has(InflectionTag.Ubestemt)
                  ) {
                    singular = wordForms
                      .map((wf) => `_${indefiniteArticle}_ ${wf}`)
                      .join(', ');
                  } else if (
                    tags.has(InflectionTag.Fleirtal) &&
                    tags.has(InflectionTag.Ubestemt)
                  ) {
                    plural = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Bestemt) &&
                    tags.has(InflectionTag.Eintal)
                  ) {
                    definiteSingular = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Bestemt) &&
                    tags.has(InflectionTag.Fleirtal)
                  ) {
                    definitePlural = wordForms.join(', ');
                  }
                }

                const nounForms = [
                  singular,
                  plural,
                  definiteSingular,
                  definitePlural,
                ].filter((f) => f);

                if (nounForms.length) {
                  text += nounForms.join('; ') + '\n';
                }
              } else if (article.wordClass === WordClass.Adjektiv) {
                let masculineSingular: string | undefined;
                let feminineSingular: string | undefined;
                let commonSingular: string | undefined;
                let neuterSingular: string | undefined;
                let plural: string | undefined;
                let definiteSingular: string | undefined;

                let comparative: string | undefined;
                let superlativeIndefinite: string | undefined;
                let superlativeDefinite: string | undefined;

                for (const { tags, wordForms } of groupedInflections.values()) {
                  if (
                    tags.has(InflectionTag.Eintal) &&
                    tags.has(InflectionTag.Hankjoenn)
                  ) {
                    masculineSingular = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Eintal) &&
                    tags.has(InflectionTag.Hokjoenn)
                  ) {
                    feminineSingular = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Eintal) &&
                    tags.has(InflectionTag.HankjoennHokjoenn)
                  ) {
                    commonSingular = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Eintal) &&
                    tags.has(InflectionTag.Inkjekjoenn)
                  ) {
                    neuterSingular = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Eintal) &&
                    tags.has(InflectionTag.Bestemt)
                  ) {
                    definiteSingular = wordForms.join(', ');
                  } else if (tags.has(InflectionTag.Fleirtal)) {
                    plural = wordForms.join(', ');
                  } else if (tags.has(InflectionTag.Komparativ)) {
                    comparative = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Superlativ) &&
                    tags.has(InflectionTag.Ubestemt)
                  ) {
                    superlativeIndefinite = wordForms.join(', ');
                  } else if (
                    tags.has(InflectionTag.Superlativ) &&
                    tags.has(InflectionTag.Bestemt)
                  ) {
                    superlativeDefinite = wordForms.join(', ');
                  }
                }

                const adjectiveFormsFirst = [
                  masculineSingular,
                  feminineSingular,
                  commonSingular,
                  neuterSingular,
                  plural,
                  definiteSingular,
                ].filter((f) => f);

                const adjectiveFormsSecond = [
                  comparative,
                  superlativeIndefinite,
                  superlativeDefinite,
                ].filter((f) => f);

                if (adjectiveFormsFirst.length) {
                  text += adjectiveFormsFirst.join('; ') + '\n';
                }

                if (adjectiveFormsSecond.length) {
                  text += adjectiveFormsSecond.join('; ') + '\n';
                }
              } else {
                for (const { tags, wordForms } of groupedInflections.values()) {
                  text += `${wordForms.join(', ')} (_${[...tags]
                    .map(this.formatter.formatInflectionTag)
                    .join(', ')}_)\n`;
                }
              }
            }

            if (!text) {
              continue;
            }

            fields.push({
              name: paradigmText,
              value: text,
            });
          }
        }

        if (!fields.length) {
          continue;
        }

        let articleHeader = `${
          article.wordClass
        }${genderString}\n_frå ${this.formatter.formatDictionary(
          article.dictionary,
        )}_`;
        const url = this.formatter.getUrl(article);

        if (url) {
          articleHeader += `\n[Les meir](${url})`;
        }

        if (splitInfinitive) {
          articleHeader += '\n\nKløyvd infinitiv: -a\n';
        }

        const title =
          article.lemmas?.reduce((acc, lemma) => {
            const lemmaText =
              article.wordClass === 'Verb' ? `å ${lemma.lemma}` : lemma.lemma;
            return acc ? `${acc}, ${lemmaText}` : lemmaText;
          }, '') ?? word;

        embeds.push(
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(articleHeader)
            .addFields(fields),
        );
      }

      if (!embeds.length) {
        await interaction.editReply(
          `Ingen treff for ${word}${dictionary ? `i ${this.formatter.formatDictionary(dictionary)}` : ''}`,
        );
        return;
      }

      await this.pagination.paginate({
        interaction,
        embeds,
        additionalButtons:
          sendToEveryone ||
          !interaction.channel ||
          interaction.channel.isDMBased()
            ? []
            : [this.showEveryone.getButton(DisplayLanguage.Norwegian)],
      });
    } catch (err) {
      this.#logger.error('Feil under ordboksøk:', err);
      interaction.editReply('Det skjedde ein feil under ordboksøket');
    }
  }
}
