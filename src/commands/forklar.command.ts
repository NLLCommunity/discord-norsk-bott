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
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  ExplanationProvider,
  RateLimiterProvider,
  ShowEveryoneProvider,
} from '../providers/index.js';
import { DisplayLanguage } from '../types/index.js';
import { ShowEveryoneParam } from '../utils/index.js';

export class ForklarCommandParams {
  @Param({
    name: 'tekst',
    description:
      'Ordet eller frasen som skal forklarast. / The word or phrase to explain.',
    required: true,
    type: ParamType.STRING,
  })
  tekst: string;

  @ShowEveryoneParam()
  showEveryone: boolean;
}

/**
 * Explains a word or phrase in Norwegian.
 */
@Injectable()
@Command({
  name: 'forklar',
  description: 'Forklårar eit ord eller ein frase / Explains a word or phrase',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class ForklarCommand {
  constructor(
    private readonly explainer: ExplanationProvider,
    private readonly showEveryone: ShowEveryoneProvider,
    private readonly rateLimiter: RateLimiterProvider,
  ) {}

  #logger = new Logger(ForklarCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { tekst, showEveryone }: ForklarCommandParams,
  ): Promise<void> {
    this.#logger.log(`Explaining a word or phrase in Norwegian`);

    if (
      showEveryone &&
      this.rateLimiter.isRateLimited(ForklarCommand.name, interaction, {
        maxPerWindow: 5,
        window: 30 * 60 * 1000, // 30 minutes
      })
    ) {
      return;
    }

    if (!this.explainer.isAvailable) {
      await interaction.reply({
        content:
          'Denne kommandoen er ikkje tilgjengeleg fordi den ikkje er konfigurert.',
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferReply({
      flags: showEveryone
        ? MessageFlags.SuppressEmbeds
        : MessageFlags.SuppressEmbeds | MessageFlags.Ephemeral,
    });

    try {
      const response = await this.explainer.explain(
        tekst,
        DisplayLanguage.Norwegian,
      );

      if (!response) {
        this.#logger.warn('Failed to explain message');
        interaction.editReply('Klarte ikkje å forklåre meldinga.');
        return;
      }

      const header = `> ⚠️ **Merk:** Denne forklåringa er generert av ein KI-modell og kan vera unøyaktig eller variere kvar gong ho vert generert. For den mest nøyaktige informasjonen, spør ein menneskeleg ekspert.

`;
      let summary = header;
      let lastLength = 0;

      const interval = setInterval(() => {
        // Update reply only if summary has changed, handling carriage returns
        if (summary.length === lastLength) {
          return;
        }

        lastLength = summary.length;

        interaction.editReply(summary + '▮').catch((error) => {
          this.#logger.error('Failed to update explanation', error);
        });
      }, 500);

      for await (const chunk of response) {
        const text = chunk.toString() as string;
        // Handle carriage return: if present, replace the summary with the latest segment
        if (text.includes('\r')) {
          const segments = text.split('\r');
          summary = header + segments[segments.length - 1];
        } else {
          summary += text;
        }

        if (summary.length >= 2000) {
          const tooLong = '…\n\n**Forklåringa er for lang, stoppar her.**';

          summary = summary.slice(0, 2000 - tooLong.length) + tooLong;
          // Abort the underlying stream by destroying it
          response.destroy();
          break;
        }
      }

      clearInterval(interval);
      await interaction.editReply({
        content: summary,
        components: showEveryone ? [] : [this.showEveryone.getActionRow()],
        flags: MessageFlags.SuppressEmbeds,
      });
    } catch (err) {
      this.#logger.error('Failed to explain message', err);
      interaction.editReply('Klarte ikkje å forklara meldinga.');
    }
  }
}
