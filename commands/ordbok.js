import { EmbedBuilder } from 'discord.js';
import {
  OrdbokApiService,
  Dictionary,
  Gender,
} from '../providers/ordbokapi.js';
import { NorskSlashCommandBuilder } from '../helpers/command-builder.js';
import { OptionParser } from '../helpers/option-parser.js';

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

          /** @type {EmbedBuilder[]} */
          const embeds = [];

          let overLimit = false;

          for (const [index, article] of response.entries()) {
            if (index === 10) {
              overLimit = true;
              break;
            }

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

            const title = article.lemmas.reduce((acc, lemma) => {
              const lemmaText =
                article.wordClass === 'Verb' ? `å ${lemma.lemma}` : lemma.lemma;
              return acc ? `${acc}, ${lemmaText}` : lemmaText;
            }, '');

            const articleHeader = `${
              article.wordClass
            }${genderString}\n_frå ${formatDict(
              article.dictionary
            )}_\n[Les meir](${getUrl(article)})`;

            const body = `${articleHeader}\n${definitions}`;

            const embed = new EmbedBuilder()
              .setTitle(title)
              .setDescription(body);

            embeds.push(embed);
          }

          if (!embeds.length) {
            await interaction.editReply('Ingen treff');
            return;
          }

          await interaction.editReply({
            body: `Fann ${response.length} treff`,
            embeds,
          });

          if (overLimit) {
            await interaction.followUp({
              content:
                'Viser berre dei 10 første treffa. For meir treff, gå til ordbokene.no, eller bruk kommandoen med meir spesifikke søkekriterium.',
            });
          }
        } catch (err) {
          console.error('Feil under ordboksøk:', err);
          interaction.editReply('Det skjedde ein feil under ordboksøket');
        }
      },
    },
  };
}
