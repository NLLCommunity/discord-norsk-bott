import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import {
  OrdbokApiService,
  Dictionary,
  Gender,
} from '../providers/ordbokapi.js';

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
    new SlashCommandBuilder()
      .setName('ordbok')
      .setDescription('Søk etter ord i ordbøkene')
      .addStringOption((option) =>
        option
          .setName('ord')
          .setDescription('Ordet du vil søkja etter')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('ordbok')
          .setDescription(
            'Ordboka du vil søkja i. Viss du ikkje vel noko, søkjer du i alle ordbøkene.'
          )
          .addChoices(
            { name: 'nynorsk', value: 'Nynorsk' },
            { name: 'bokmål', value: 'Bokmål' },
            {
              name: 'nynorsk og bokmål',
              value: 'Nynorsk,Bokmål',
            }
          )
          .setRequired(false)
      )
  );

  return {
    ordbok: {
      /**
       * Executes the ordbok command.
       * @param {import('discord.js').CommandInteraction} interaction
       */
      async execute(interaction) {
        await interaction.deferReply();

        const word = interaction.options.getString('ord');
        const dicts = interaction.options.getString('ordbok');

        const dictionaries = dicts
          ? dicts.split(',').map((d) => Dictionary[d])
          : Object.values(Dictionary);

        try {
          const response = await ordbokApi.definitions(word, dictionaries);
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

              const articleHeader = `_frå ${article.dictionary}_\n<${getUrl(
                article
              )}>\n`;

              return `${articleHeader}**${lemmas}** (${article.wordClass}${genderString})\n${definitions}`;
            })
            .join('\n\n---\n\n');

          await interaction.editReply(message || 'Ingen treff');
        } catch (err) {
          console.error('Feil under ordboksøk:', err);
          interaction.editReply('Det skjedde ein feil under ordbokauka');
        }
      },
    },
  };
}
