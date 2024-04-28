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
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  ExplanationProvider,
  RateLimiterProvider,
  ShowEveryoneProvider,
} from '../providers';
import { DisplayLanguage } from '../types';
import { ShowEveryoneParam } from 'src/utils';

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
  description: 'Forklarar eit ord eller ein frase / Explains a word or phrase',
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
        ephemeral: true,
      });

      return;
    }

    await interaction.deferReply({
      ephemeral: !showEveryone,
    });

    try {
      const response = await this.explainer.explain(
        tekst,
        DisplayLanguage.Norwegian,
      );

      if (!response) {
        this.#logger.warn('Failed to explain message');
        interaction.editReply('Klarte ikkje å forklara meldinga.');
        return;
      }

      let summary = `> ⚠️ **Merk:** Denne forklaringa er generert av ein AI-modell og kan vere unøyaktig eller variere kvar gong den blir generert. For den mest nøyaktige informasjonen, spør ein menneskeleg ekspert.
>_Visste du at me betalar for kvar forklaring? Hjelp oss med å tilby forklaringar [ved å donera til Ada](https://github.com/sponsors/adalinesimonian)._

`;
      let lastLength = 0;

      const interval = setInterval(() => {
        if (summary.length === lastLength) {
          return;
        }

        lastLength = summary.length;

        interaction.editReply(summary + '▮').catch((error) => {
          this.#logger.error('Failed to update explanation', error);
        });
      }, 500);

      for await (const chunk of response) {
        summary += chunk.choices[0]?.delta.content ?? '';

        if (summary.length >= 2000) {
          const tooLong = '…\n\n**Forklaringa er for lang, stoppar her.**';

          summary = summary.slice(0, 2000 - tooLong.length) + tooLong;

          response.controller.abort();

          break;
        }
      }

      clearInterval(interval);
      await interaction.editReply({
        content: summary,
        components: showEveryone ? [] : [this.showEveryone.getActionRow()],
      });
    } catch (err) {
      this.#logger.error('Failed to explain message', err);
      interaction.editReply('Klarte ikkje å forklara meldinga.');
    }
  }
}
