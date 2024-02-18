import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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
      .setName('ordbok')
      .setDescription('Søk etter ord i ordbøkene')
      .addWordOption()
      .addDictionaryOption()
      .addWordClassOption()
  );

  return {
    ordbok: {
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
          const response = await ordbokApi.definitions(
            word,
            dictionaries,
            wordClass
          );
          const message = response
            .map((article) => {
              const lemmas = article.lemmas
                .map((lemma) => lemma.lemma)
                .join(', ');

              const definitions = article.definitions
                .map(
                  (definition, definitionIndex) =>
                    `${definitionIndex + 1}. ` +
                    definition.content.map((c) => c.textContent).join('; ')
                )
                .join('\n');

              const genderString = article.gender
                ? `, ${formatGender(article.gender)}`
                : '';

              const articleHeader = `_frå ${formatDict(
                article.dictionary
              )}_\n<${getUrl(article)}>\n`;

              return `${articleHeader}**${lemmas}** (${article.wordClass}${genderString})\n${definitions}`;
            })
            .join('\n\n---\n\n');

          if (!message) {
            interaction.editReply('Ingen treff');
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
