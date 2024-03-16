import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  PaginationProvider,
  OrdbokApiProvider,
  FormatterProvider,
} from '../providers';
import {
  DictParam,
  WordParam,
  WordClassParam,
  ShowEveryoneParam,
} from '../utils';
import { Dictionary, WordClass } from '../gql/graphql';

export class BøyingCommandParams {
  @WordParam()
  word: string;

  @DictParam()
  dictionary?: Dictionary;

  @WordClassParam()
  wordClass?: WordClass;

  @ShowEveryoneParam()
  sendToEveryone?: boolean;
}

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
    { word, dictionary, wordClass, sendToEveryone }: BøyingCommandParams,
  ): Promise<void> {
    await interaction.deferReply({
      ephemeral: !sendToEveryone,
    });

    this.#logger.log(
      `Søkjer etter ${word} i ${dictionary} med ordklasse ${wordClass}`,
    );

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

        for (const lemma of article.lemmas || []) {
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
              paradigmText = `**${paradigm.tags
                .map(this.formatter.formatInflectionTag)
                .join(', ')}**`;
            } else {
              paradigmText =
                lemma.paradigms.length > 1
                  ? `Bøyingsmønster ${index + 1}`
                  : 'Bøyingsmønster';
            }

            /** @type {Map<string, { tags: string[], wordForms: string[] }>} */
            const groupedInflections = paradigm.inflections.reduce(
              (acc, inflection) => {
                const key = inflection.tags.sort().join('|');
                if (!acc.has(key)) {
                  acc.set(key, { tags: inflection.tags, wordForms: [] });
                }
                acc.get(key).wordForms.push(inflection.wordForm);
                return acc;
              },
              new Map(),
            );

            for (const { tags, wordForms } of groupedInflections.values()) {
              text += `${wordForms.join(', ')} (_${tags
                .map(this.formatter.formatInflectionTag)
                .join(', ')}_)\n`;
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

        let articleHeader = `_frå ${this.formatter.formatDictionary(
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

      await this.pagination.paginate(interaction, embeds);
    } catch (err) {
      this.#logger.error('Feil under ordboksøk:', err);
      interaction.editReply('Det skjedde ein feil under ordboksøket');
    }
  }
}
