import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import {
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  PaginationProvider,
  OrdbokApiProvider,
  FormatterProvider,
  RateLimiterProvider,
  ShowEveryoneProvider,
} from '../providers/index.js';
import {
  DictParam,
  WordParam,
  WordClassParam,
  ShowEveryoneParam,
} from '../utils/index.js';
import { DisplayLanguage } from '../types/index.js';
import { Dictionary, Gender, WordClass } from '../gql/graphql.js';

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
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
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

    const verbFormRegex = /å ([^\s]+)/i;
    const verbFormMatch = word.match(verbFormRegex);

    const nounFormRegex = /(ei?n?|ei?t) ([^\s]+)/i;
    const nounFormMatch = word.match(nounFormRegex);

    let searchWord = word;
    let searchWordClass = wordClass;
    let gender: Gender | undefined;

    if (!searchWordClass) {
      if (verbFormMatch) {
        searchWord = verbFormMatch[1];
        searchWordClass = WordClass.Verb;
      } else if (nounFormMatch) {
        searchWord = nounFormMatch[2];
        searchWordClass = WordClass.Substantiv;

        const lastChar = nounFormMatch[1][nounFormMatch[1].length - 1];

        if (lastChar === 'i') {
          gender = Gender.Hokjoenn;
        } else if (lastChar === 'n') {
          gender = Gender.Hankjoenn;
        } else {
          gender = Gender.Inkjekjoenn;
        }
      }
    }

    const dictionaries = dictionary
      ? [dictionary]
      : [Dictionary.Bokmaalsordboka, Dictionary.Nynorskordboka];

    try {
      const response = await this.ordbokApi.definitions(
        searchWord,
        dictionaries,
        searchWordClass,
      );

      const filtered = gender
        ? response.filter(
            (article) =>
              article.gender === gender ||
              (article.gender === Gender.HankjoennHokjoenn &&
                (gender === Gender.Hankjoenn || gender === Gender.Hokjoenn)),
          )
        : response;

      const embeds: EmbedBuilder[] = filtered.map((article) =>
        this.formatter.embedForArticle(article, word),
      );

      if (!embeds.length) {
        const suggestions = await this.ordbokApi.suggestions(
          word,
          dictionaries,
        );

        let reply = `Ingen treff for *${word}*${dictionary ? ` i ${this.formatter.formatDictionary(dictionary)}` : ''}.`;

        if (suggestions.length) {
          reply += ` Kanskje du meinte eit av desse alternativa?\n\n${suggestions
            .slice(0, 3)
            .map((suggestion, index) => `${index + 1}. *${suggestion}*`)
            .join('\n')}`;
        }

        await interaction.editReply(reply);

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
