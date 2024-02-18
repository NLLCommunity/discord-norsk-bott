import {
  OrdbokApiService,
  Dictionary,
  Gender,
} from '../providers/ordbokapi.js';
import { NorskSlashCommandBuilder } from '../helpers/command-builder.js';
import { OptionParser } from '../helpers/option-parser.js';
import { reply } from '../helpers/reply.js';

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
          const message = response
            .map((article) => {
              let text = '';

              for (const lemma of article.lemmas) {
                text += `**${lemma.lemma}** (${article.wordClass})\n\n`;

                for (const [index, paradigm] of lemma.paradigms.entries()) {
                  if (index > 0) {
                    text += '\n';
                  }

                  if (paradigm.tags.length) {
                    text += `**${paradigm.tags
                      .map(formatInflectionTag)
                      .join(', ')}**:\n`;
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

                  for (const {
                    tags,
                    wordForms,
                  } of groupedInflections.values()) {
                    text += `${wordForms.join(', ')} (_${tags
                      .map(formatInflectionTag)
                      .join(', ')}_)\n`;
                  }
                }
              }

              const articleHeader = `_frå ${formatDict(
                article.dictionary
              )}_\n<${getUrl(article)}>\n`;

              return `${articleHeader}${text}`;
            })
            .join('\n---\n\n');

          if (!message) {
            await interaction.editReply('Ingen treff');
            return;
          }

          await reply(interaction, message);
        } catch (err) {
          console.error('Feil under ordboksøk:', err);
          interaction.editReply('Det skjedde ein feil under ordboksøket');
        }
      },
    },
  };
}
