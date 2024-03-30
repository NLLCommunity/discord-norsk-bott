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
import { TranslatorProvider, TranslationLanguage } from '../../providers';
import { ShowEveryoneParamEn } from '../../utils';
import { DisplayLanguage } from '../../types';

export class NnenCommandParams {
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
 * Translates text from Nynorsk to English.
 */
@Injectable()
@Command({
  name: 'nnen',
  description:
    'Omset frå nynorsk til engelsk / Translate from Nynorsk to English',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class NnenCommand {
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
    { text, sendToEveryone }: NnenCommandParams,
  ): Promise<void> {
    await this.translator.translate({
      interaction,
      from: TranslationLanguage.Nynorsk,
      to: TranslationLanguage.English,
      text,
      ephemeral: !sendToEveryone,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
