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
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
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
      from: TranslationLanguage.Bokmål,
      to: TranslationLanguage.English,
      text,
      ephemeral: !sendToEveryone,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
