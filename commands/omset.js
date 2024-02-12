import { SlashCommandBuilder } from 'discord.js';
import { ApertiumService, Language } from '../providers/apertium.js';

const apertium = new ApertiumService();

/**
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {Language} from
 * @param {Language} to
 * @param {string} text
 */
async function translate(interaction, from, to, text) {
  if (text.length > 2000) {
    await interaction.reply(
      'Teksten er for lang til å bli sendt. Prøv å korta ned teksten.'
    );
    return;
  }

  await interaction.deferReply();

  try {
    const finalText = await apertium.translate(from, to, text);

    if (finalText.length > 2000) {
      await interaction.editReply(
        'Omsett tekst er for lang til å bli sendt. Prøv å korta ned teksten.'
      );
      return;
    }

    if (from === Language.Bokmål) {
      await interaction.editReply(
        `Omsett frå bokmål til nynorsk:\n> ${finalText}`
      );
    } else {
      await interaction.editReply(
        `Omsett frå nynorsk til bokmål:\n> ${finalText}`
      );
    }
  } catch (err) {
    console.error(`Feil under omsetjing: ${err}`);
    await interaction.editReply(
      'Det skjedde ein feil under omsetjinga. Prøv igjen seinare.'
    );
  }
}

/**
 * @param {import('discord.js').Client} client
 * @returns {{ [key: string]: import('discord.js').ApplicationCommand }}
 */
export function register(client) {
  client.application.commands.create(
    new SlashCommandBuilder()
      .setName('nbnn')
      .setDescription('Omset frå nynorsk til bokmål')
      .addStringOption((option) =>
        option
          .setName('tekst')
          .setDescription('Teksten du vil omsetja')
          .setRequired(true)
      )
  );

  client.application.commands.create(
    new SlashCommandBuilder()
      .setName('nnnb')
      .setDescription('Omset frå bokmål til nynorsk')
      .addStringOption((option) =>
        option
          .setName('tekst')
          .setDescription('Teksten du vil omsetja')
          .setRequired(true)
      )
  );

  return {
    nbnn: {
      async execute(interaction) {
        await translate(
          interaction,
          Language.Bokmål,
          Language.Nynorsk,
          interaction.options.getString('tekst')
        );
      },
    },
    nnnb: {
      async execute(interaction) {
        await translate(
          interaction,
          Language.Nynorsk,
          Language.Bokmål,
          interaction.options.getString('tekst')
        );
      },
    },
  };
}
