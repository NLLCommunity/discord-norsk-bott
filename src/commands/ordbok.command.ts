import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  PaginationProvider,
  OrdbokApiProvider,
  FormatterProvider,
} from '../providers';
import { DictParam, WordParam, WordClassParam } from '../utils';
import { Dictionary, WordClass } from '../gql/graphql';

export class OrdbokCommandParams {
  @WordParam()
  word: string;

  @DictParam()
  dictionary?: Dictionary;

  @WordClassParam()
  wordClass?: WordClass;
}

/**
 * A command for searching the dictionary.
 */
@Injectable()
@Command({
  name: 'ordbok',
  description: 'Søk i ordbøkene',
})
export class OrdbokCommand {
  constructor(
    private readonly pagination: PaginationProvider,
    private readonly ordbokApi: OrdbokApiProvider,
    private readonly formatter: FormatterProvider,
  ) {}

  #logger = new Logger(OrdbokCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param ord The word to search for.
   * @param ordbok The dictionary to search in.
   * @param ordklasse The word class to filter by.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { word, dictionary, wordClass }: OrdbokCommandParams,
  ): Promise<void> {
    await interaction.deferReply();

    this.#logger.log(
      `Søkjer etter ${word} i ${dictionary} med ordklasse ${wordClass}`,
    );

    try {
      const response = await this.ordbokApi.definitions(
        word,
        dictionary
          ? [dictionary]
          : [Dictionary.Bokmaalsordboka, Dictionary.Nynorskordboka],
        wordClass,
      );

      const embeds: EmbedBuilder[] = [];

      for (const article of response) {
        const definitions =
          article.definitions
            ?.map(
              (definition, definitionIndex) =>
                `${definitionIndex + 1}. ` +
                definition.content.map((c) => c.textContent).join('; '),
            )
            .join('\n') ?? '';

        const genderString = article.gender
          ? `, ${this.formatter.formatGender(article.gender)}`
          : '';

        const title =
          article.lemmas?.reduce((acc, lemma) => {
            const lemmaText =
              article.wordClass === 'Verb' ? `å ${lemma.lemma}` : lemma.lemma;
            return acc ? `${acc}, ${lemmaText}` : lemmaText;
          }, '') ?? word;

        let articleHeader = `${
          article.wordClass
        }${genderString}\n_frå ${this.formatter.formatDictionary(
          article.dictionary,
        )}_`;
        const url = this.formatter.getUrl(article);

        if (url) {
          articleHeader += `\n[Les meir](${url})`;
        }

        const body = `${articleHeader}\n${definitions}`;

        const embed = new EmbedBuilder().setTitle(title).setDescription(body);

        embeds.push(embed);
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
