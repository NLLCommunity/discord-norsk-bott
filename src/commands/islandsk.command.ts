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
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { RateLimiterProvider, ShowEveryoneProvider } from '../providers';
import { ShowEveryoneParam } from '../utils';

export class IslandskCommandParams {
  @Param({
    name: 'tekst',
    description: 'Tekstur du vilinn omsetjur / The text you want to translate',
    type: ParamType.STRING,
    required: true,
  })
  text: string;

  @ShowEveryoneParam()
  sendToEveryone?: boolean;
}

/**
 * Joke command to translate text to fake Icelandic (-ur and -inn suffixes
 * added to words).
 */
@Injectable()
@Command({
  name: 'islandsk',
  description: 'Omsetur tilinn islandskur / Translate to Icelandic',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class IslandskCommand {
  constructor(
    private readonly rateLimiter: RateLimiterProvider,
    private readonly showEveryone: ShowEveryoneProvider,
  ) {}

  #logger = new Logger(IslandskCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { text, sendToEveryone }: IslandskCommandParams,
  ): Promise<void> {
    this.#logger.log(`Omsetur tilinn islandskur: ${text}`);

    if (
      sendToEveryone &&
      this.rateLimiter.isRateLimited(IslandskCommand.name, interaction)
    ) {
      return;
    }

    // - Replace words such that they end with -ur.
    // - If the last vowel is "i", replace it with "inn" instead.
    // - Replace words that end with vowels such that the vowels at the end are
    //   replaced with -ur. Do not do this for words that don't have at least
    //   two consonants before the vowel. Do not do this either if the word's
    //   length is less than 3 or if the last vowel is "i".
    // - If the word ends with "ur" or "inn", do not change it.
    //
    //   For example:
    //   - "bo" -> "bo"
    //   - "boka" -> "bokur"
    //   - "bok" -> "bokur"
    //   - "boki" -> "bokinn"
    //   - "til" -> "tilinn"
    //   - "bokur" -> "bokur"
    //   - "bokinn" -> "bokinn"

    const wordRegex = /\b([a-zæøåäö]+)\b/gi;

    let translatedText = text.replace(wordRegex, (word) => {
      if (word.length < 3 || /ur$|inn$/i.test(word)) {
        return word;
      }

      const isCapitalized = /[A-ZÆØÅÄÖ]$/.test(word);

      const [ur, inn] = isCapitalized ? ['UR', 'INN'] : ['ur', 'inn'];

      // match vowels followed by r (e.g. "ar", "år", etc.)
      const vowelsFollowedByRMatch = word.match(
        /(?<=[^aeiouyæøåäö])[aeiouyæøåäö]r$/i,
      );

      if (vowelsFollowedByRMatch) {
        // Replace the er/ar/etc. with -ur.
        return word.slice(0, -2) + ur;
      }

      // match last vowel, even if it's before the consonants at the end
      const lastVowelsMatch = word.match(/[aeiouyæøåäö]+(?=[^aeiouyæøåäö]*$)/i);

      if (!lastVowelsMatch) {
        return word;
      }

      const endsWithVowel = /[aeiouyæøåäö]/i.test(word[word.length - 1]);

      if (endsWithVowel) {
        // Only replace if removing the vowels at the end leaves at least
        // three characters in the word.
        if (word.length - lastVowelsMatch[0].length < 3) {
          return word;
        }

        // Replace the last vowels with -inn if the last vowel is "i".
        if (lastVowelsMatch[0] === 'i') {
          return word.replace(/[aeiouyæøåäö]+$/i, inn);
        }

        // Replace the last vowels with -ur.
        return word.replace(/[aeiouyæøåäö]+$/i, ur);
      }

      // Add -inn to the word if the last vowel is "i".
      if (lastVowelsMatch[0] === 'i') {
        return `${word}${inn}`;
      }

      // Add -ur to the word.
      return `${word}${ur}`;
    });

    translatedText = translatedText
      .replace(/d(ur)\b/gi, 'ð$1') // Replace "dur" with "ður".
      .replace(/(?<=[^0-9]|\b)th/gi, 'þ') // Replace "th" with "þ".
      .replace(/dt/gi, 'þ'); // Replace "dt" with "þ".

    const embed = new EmbedBuilder()
      .setTitle('Translated to Icelandic')
      .setDescription(translatedText)
      .setFooter({ text: '⚠️ Translations may contain mistakes.' });

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (
      !sendToEveryone && // Only show the button if the message is ephemeral
      interaction.channel && // Ensure the interaction has a channel
      'name' in interaction.channel &&
      interaction.channel.name // Ensure the channel is a guild channel
    ) {
      components.push(this.showEveryone.getActionRow());
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: !sendToEveryone,
      components,
    });
  }
}
