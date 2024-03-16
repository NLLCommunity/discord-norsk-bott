import { Injectable, Inject, Logger } from '@nestjs/common';
import { type ChatInputCommandInteraction } from 'discord.js';
import { ApertiumProvider, Language } from './apertium.provider';

/**
 * Translates the given text to the given language.
 */
@Injectable()
export class TranslatorProvider {
  constructor(
    @Inject(ApertiumProvider)
    private readonly apertium: ApertiumProvider,
  ) {}

  #logger = new Logger(TranslatorProvider.name);

  /**
   * Translates the given text to the given language.
   * @param interaction The interaction to reply to.
   * @param from The language to translate from.
   * @param to The language to translate to.
   * @param text The text to translate.
   * @returns The translated text.
   */
  async translate({
    interaction,
    from,
    to,
    text,
    ephemeral = true,
  }: {
    interaction: ChatInputCommandInteraction;
    from: Language;
    to: Language;
    text: string;
    ephemeral?: boolean;
  }): Promise<void> {
    this.#logger.log(`Omset frå ${from} til ${to}: ${text}`);

    if (text.length > 1800) {
      await interaction.reply({
        content:
          'Teksten er for lang til å bli sendt. Prøv å korta ned teksten.',
        ephemeral,
      });
      return;
    }

    await interaction.deferReply({
      ephemeral,
    });

    try {
      const finalText = await this.apertium.translate(from, to, text);

      if (finalText.length > 1800) {
        await interaction.editReply(
          'Omsett tekst er for lang til å bli sendt. Prøv å korta ned teksten.',
        );
        return;
      }

      if (from === Language.Bokmål) {
        await interaction.editReply(
          `Omsett frå bokmål til nynorsk:\n> ${finalText}`,
        );
      } else {
        await interaction.editReply(
          `Omsett frå nynorsk til bokmål:\n> ${finalText}`,
        );
      }
    } catch (err) {
      console.error(`Feil under omsetjing: ${err}`);
      await interaction.editReply(
        'Det skjedde ein feil under omsetjinga. Prøv igjen seinare.',
      );
    }
  }
}
