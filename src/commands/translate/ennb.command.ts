import { Injectable } from '@nestjs/common';
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
  TranslatorProvider,
  TranslationLanguage,
} from '../../providers/index.js';
import { ShowEveryoneParamEn } from '../../utils/index.js';
import { DisplayLanguage } from '../../types/index.js';

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
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
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
      from: TranslationLanguage.English,
      to: TranslationLanguage.Bokmål,
      text,
      ephemeral: !sendToEveryone,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
