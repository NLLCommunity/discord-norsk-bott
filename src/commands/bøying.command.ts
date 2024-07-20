import { Injectable, Logger } from '@nestjs/common';
import {
  Command,
  Handler,
  InteractionEvent,
  Param,
  ParamType,
} from '@discord-nestjs/core';
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
  InflectionFormatterProvider,
} from '../providers/index.js';
import {
  DictParam,
  WordParam,
  WordClassParam,
  ShowEveryoneParam,
} from '../utils/index.js';
import { DisplayLanguage } from '../types/index.js';
import { Dictionary, WordClass } from '../gql/graphql.js';

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

/**
 * A command for retrieving inflections of a word.
 */
@Injectable()
@Command({
  name: 'bøying',
  description: 'Søk etter bøying av ord / Search for inflections of a word',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class BøyingCommand {
  constructor(
    private readonly pagination: PaginationProvider,
    private readonly ordbokApi: OrdbokApiProvider,
    private readonly formatter: FormatterProvider,
    private readonly rateLimiter: RateLimiterProvider,
    private readonly showEveryone: ShowEveryoneProvider,
    private readonly inflectionFormatter: InflectionFormatterProvider,
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

        const genderString = article.gender
          ? `, ${this.formatter.formatGender(article.gender)}`
          : '';

        let lastHeader = '';

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
                  .map(this.inflectionFormatter.formatInflectionTag)
                  .join(', ') + (lemmas.length > 1 ? ` (${lemma.lemma})` : '');
            } else {
              paradigmText =
                lemma.paradigms.length > 1
                  ? `Bøyingsmønster ${index + 1}${lemmas.length > 1 ? ` (${lemma.lemma})` : ''}`
                  : `Bøyingsmønster${lemmas.length > 1 ? ` (${lemma.lemma})` : ''}`;
            }

            const { groups, full: showLong } =
              this.inflectionFormatter.formatInflections({
                article,
                paradigm,
                full,
              });

            if (showLong) {
              for (const inflections of groups) {
                for (const { name, forms } of inflections) {
                  text += `${forms} (_${name}_)\n`;
                }
              }
            } else {
              for (const inflections of groups) {
                let header = '';
                let formList = '';

                for (const { name, forms } of inflections) {
                  header += header ? `; ${name}` : name;
                  formList += formList ? `; ${forms}` : forms;
                }

                if (header !== lastHeader) {
                  text += `_${header}_\n> ${formList}\n`;
                  lastHeader = header;
                } else {
                  text += `> ${formList}\n`;
                }
              }
            }

            const trimmed = text.trim();

            if (!trimmed) {
              continue;
            }

            fields.push({
              name: paradigmText,
              value: trimmed,
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
