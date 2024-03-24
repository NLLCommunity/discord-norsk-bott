import { Injectable } from '@nestjs/common';
import {
  Command,
  Handler,
  InteractionEvent,
  Param,
  ParamType,
} from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { type ChatInputCommandInteraction } from 'discord.js';
import { TranslatorProvider } from '../../providers';
import { ShowEveryoneParamEn } from '../../utils';
import { Language, DisplayLanguage } from '../../types';

export class EnnbCommandParams {
  @Param({
    name: 'tekst',
    description: 'Teksten du vil omsetja / The text you want to translate',
    type: ParamType.STRING,
    required: true,
  })
  text: string;

  @ShowEveryoneParamEn()
  sendToEveryone?: boolean;
}

/**
 * Translates text from English to Bokmål.
 */
@Injectable()
@Command({
  name: 'ennb',
  description:
    'Omset frå engelsk til bokmål / Translate from English to Bokmål',
})
export class EnnbCommand {
  constructor(private readonly translator: TranslatorProvider) {}

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { text, sendToEveryone }: EnnbCommandParams,
  ): Promise<void> {
    await this.translator.translate({
      interaction,
      from: Language.English,
      to: Language.Bokmål,
      text,
      ephemeral: !sendToEveryone,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
