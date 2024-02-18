import { SlashCommandBuilder } from 'discord.js';

export class NorskSlashCommandBuilder extends SlashCommandBuilder {
  addWordOption() {
    return this.addStringOption((option) =>
      option
        .setName('ord')
        .setDescription('Ordet du vil søkja etter')
        .setRequired(true)
    );
  }

  addDictionaryOption() {
    return this.addStringOption((option) =>
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
    );
  }

  addWordClassOption() {
    return this.addStringOption((option) =>
      option
        .setName('ordklasse')
        .setDescription('Ordklassen du vil filtrera på')
        .setRequired(false)
        .addChoices(
          { name: 'Substantiv', value: 'Substantiv' },
          { name: 'Adjektiv', value: 'Adjektiv' },
          { name: 'Adverb', value: 'Adverb' },
          { name: 'Verb', value: 'Verb' },
          { name: 'Pronomen', value: 'Pronomen' },
          { name: 'Preposisjon', value: 'Preposisjon' },
          { name: 'Konjunksjon', value: 'Konjunksjon' },
          { name: 'Interjeksjon', value: 'Interjeksjon' },
          { name: 'Determinativ', value: 'Determinativ' },
          { name: 'Subjunksjon', value: 'Subjunksjon' },
          { name: 'Symbol', value: 'Symbol' },
          { name: 'Forkorting', value: 'Forkorting' },
          { name: 'Uttrykk', value: 'Uttrykk' }
        )
    );
  }
}
