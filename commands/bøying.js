import { EmbedBuilder } from 'discord.js';
import {
  OrdbokApiService,
  Dictionary,
  Gender,
} from '../providers/ordbokapi.js';
import { NorskSlashCommandBuilder } from '../helpers/command-builder.js';
import { OptionParser } from '../helpers/option-parser.js';
import { paginate } from '../helpers/paginate.js';

const ordbokApi = new OrdbokApiService();

const formatGender = (gender) => {
  switch (gender) {
    case Gender.Hankjønn:
      return 'hankjønn';

    case Gender.Hokjønn:
      return 'hokjønn';

    case Gender.HankjønnHokjønn:
      return 'hankjønn/hokjønn';

    case Gender.Inkjekjønn:
      return 'inkjekjønn';
  }
};

const formatDict = (dict) => {
  switch (dict) {
    case Dictionary.Bokmål:
      return 'Bokmålsordboka';

    case Dictionary.Nynorsk:
      return 'Nynorskordboka';
  }
};
const formatInflectionTag = (tag) => {
  switch (tag) {
    case 'Infinitiv':
      return 'infinitiv';

    case 'Presens':
      return 'presens';

    case 'Preteritum':
      return 'preteritum';

    case 'PerfektPartisipp':
      return 'perfekt partisipp';

    case 'PresensPartisipp':
      return 'presens partisipp';

    case 'SPassiv':
      return 's-passiv';

    case 'Imperativ':
      return 'imperativ';

    case 'Passiv':
      return 'passiv';

    case 'Adjektiv':
      return 'adjektiv';

    case 'Adverb':
      return 'adverb';

    case 'Eintal':
      return 'eintal';

    case 'HankjoennHokjoenn':
      return 'hankjønn/hokjønn';

    case 'Hankjoenn':
      return 'hankjønn';

    case 'Hokjoenn':
      return 'hokjønn';

    case 'Inkjekjoenn':
      return 'inkjekjønn';

    case 'Ubestemt':
      return 'ubestemt';

    case 'Bestemt':
      return 'bestemt';

    case 'Fleirtal':
      return 'fleirtal';

    case 'Superlativ':
      return 'superlativ';

    case 'Komparativ':
      return 'komparativ';

    case 'Positiv':
      return 'positiv';

    case 'Nominativ':
      return 'nominativ';

    case 'Akkusativ':
      return 'akkusativ';

    default:
      return tag;
  }
};

const getUrl = (article) =>
  `https://ordbokene.no/${
    article.dictionary === Dictionary.Bokmål ? 'bm' : 'nn'
  }/${article.id}`;

/**
 * @param {import('discord.js').Client} client
 * @returns {{ [key: string]: import('discord.js').ApplicationCommand }}
 */
export function register(client) {
  client.application.commands.create(
    new NorskSlashCommandBuilder()
      .setName('bøying')
      .setDescription('Søk etter bøying av ord')
      .addWordOption()
      .addDictionaryOption()
      .addWordClassOption()
  );

  return {
    bøying: {
      /**
       * Executes the ordbok command.
       * @param {import('discord.js').CommandInteraction} interaction
       */
      async execute(interaction) {
        await interaction.deferReply();

        const options = new OptionParser(interaction);

        const word = options.getWordOption();
        const dictionaries = options.getDictionaryOption();
        const wordClass = options.getWordClassOption();

        try {
          const response = await ordbokApi.inflections(
            word,
            dictionaries,
            wordClass
          );

          /** @type {EmbedBuilder[]} */
          const embeds = [];

          for (const article of response) {
            const fields = [];

            let splitInfinitive = false;

            for (const lemma of article.lemmas) {
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
                    .map(formatInflectionTag)
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
                  new Map()
                );

                for (const { tags, wordForms } of groupedInflections.values()) {
                  text += `${wordForms.join(', ')} (_${tags
                    .map(formatInflectionTag)
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

            let articleHeader = `_frå ${formatDict(
              article.dictionary
            )}_\n[Les meir](${getUrl(article)})`;

            if (splitInfinitive) {
              articleHeader += '\n\nKløyvd infinitiv: -a\n';
            }

            const title = article.lemmas.reduce((acc, lemma) => {
              const lemmaText =
                article.wordClass === 'Verb' ? `å ${lemma.lemma}` : lemma.lemma;
              return acc ? `${acc}, ${lemmaText}` : lemmaText;
            }, '');

            embeds.push(
              new EmbedBuilder()
                .setTitle(title)
                .setDescription(articleHeader)
                .addFields(fields)
            );
          }

          if (!embeds.length) {
            await interaction.editReply('Ingen treff');
            return;
          }

          await paginate(interaction, embeds);
        } catch (err) {
          console.error('Feil under ordboksøk:', err);
          interaction.editReply('Det skjedde ein feil under ordboksøket');
        }
      },
    },
  };
}
