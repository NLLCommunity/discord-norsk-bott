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
import { TranslatorProvider } from '../../providers';
import { ShowEveryoneParamEn } from '../../utils';
import { Language, DisplayLanguage } from '../../types';

export class EnnnCommandParams {
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
 * Translates text from English to Nynorsk.
 */
@Injectable()
@Command({
  name: 'ennn',
  description:
    'Omset frå engelsk til nynorsk / Translate from English to Nynorsk',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class EnnnCommand {
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
    { text, sendToEveryone }: EnnnCommandParams,
  ): Promise<void> {
    await this.translator.translate({
      interaction,
      from: Language.English,
      to: Language.Nynorsk,
      text,
      ephemeral: !sendToEveryone,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
