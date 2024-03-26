import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
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
import { Dictionary, WordClass } from '../gql/graphql';

export class OrdbokCommandParams {
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
 * A command for searching the dictionary.
 */
@Injectable()
@Command({
  name: 'ordbok',
  description:
    'Søk i ordbøkene etter definisjonar / Search the dictionaries for definitions',
})
export class OrdbokCommand {
  constructor(
    private readonly pagination: PaginationProvider,
    private readonly ordbokApi: OrdbokApiProvider,
    private readonly formatter: FormatterProvider,
    private readonly rateLimiter: RateLimiterProvider,
    private readonly showEveryone: ShowEveryoneProvider,
  ) {}

  #logger = new Logger(OrdbokCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { word, dictionary, wordClass, sendToEveryone }: OrdbokCommandParams,
  ): Promise<void> {
    this.#logger.log(
      `Søkjer etter ${word} i ${dictionary} med ordklasse ${wordClass}`,
    );

    if (
      sendToEveryone &&
      this.rateLimiter.isRateLimited(OrdbokCommand.name, interaction)
    ) {
      return;
    }

    await interaction.deferReply({
      ephemeral: !sendToEveryone,
    });

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
