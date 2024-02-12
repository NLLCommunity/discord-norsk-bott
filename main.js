import { Client, Events, GatewayIntentBits } from 'discord.js';
import { promises as fs } from 'fs';
import * as oversett from './commands/omset.js';
import * as ordbok from './commands/ordbok.js';

const token =
  process.env.DISCORD_TOKEN?.trim() ||
  (await fs.readFile('./token.txt', 'utf8')).trim();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

/** @type {{ [key: string]: import('discord.js').ApplicationCommand }} */
const commands = {};

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Klart til å køyra som ${readyClient.user.tag}!`);
  Object.assign(
    commands,
    oversett.register(readyClient),
    ordbok.register(readyClient)
  );
});

client.on(Events.ClientError, console.error);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands[interaction.commandName];

  if (!command) {
    console.error(`Ingenting fann for kommandoen ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'Det skjedde ein feil under køyring av denne kommandoen!',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'Det skjedde ein feil under køyring av denne kommandoen!',
          ephemeral: true,
        });
      }
    } catch (err) {
      console.error(err);
    }
  }
});

client.login(token);

// Catch CTRL+C
process.on('SIGINT', () => {
  client.destroy();
  process.exit(0);
});
