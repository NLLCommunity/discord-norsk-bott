/**
 * Helps parse options from a command interaction.
 * @template {import('discord.js').CacheType} T
 */
export class OptionParser {
  /**
   * @param {import('discord.js').CommandInteraction<T>} interaction
   */
  constructor(interaction) {
    this.interaction = interaction;
  }

  /**
   * Gets the dictionary option from the interaction.
   * @returns {string[]}
   */
  getDictionaryOption() {
    return (
      this.interaction.options
        .getString('ordbok')
        ?.split(',')
        ?.map((dict) =>
          dict === 'nynorsk' ? 'Nynorskordboka' : 'Bokmålsordboka'
        ) ?? []
    );
  }

  /**
   * Gets the word option from the interaction.
   * @returns {string}
   */
  getWordOption() {
    return this.interaction.options.getString('ord') ?? '';
  }

  /**
   * Gets the word class option from the interaction.
   * @returns {string | undefined}
   */
  getWordClassOption() {
    return this.interaction.options.getString('ordklasse');
  }
}
