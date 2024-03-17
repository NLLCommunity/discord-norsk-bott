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
import { TranslatorProvider } from '../providers';
import { ShowEveryoneParamEn } from '../utils';
import { Language, DisplayLanguage } from '../types';

export class NbenCommandParams {
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
 * Translates text from Bokmål to English.
 */
@Injectable()
@Command({
  name: 'nben',
  description:
    'Omset frå bokmål til engelsk / Translate from Bokmål to English',
})
export class NbenCommand {
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
    { text, sendToEveryone }: NbenCommandParams,
  ): Promise<void> {
    await this.translator.translate({
      interaction,
      from: Language.Bokmål,
      to: Language.English,
      text,
      ephemeral: !sendToEveryone,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
