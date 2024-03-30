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
import { ShowEveryoneParam } from '../../utils';

export class NbnnCommandParams {
  @Param({
    name: 'tekst',
    description: 'Teksten du vil omsetja / The text you want to translate',
    type: ParamType.STRING,
    required: true,
  })
  text: string;

  @ShowEveryoneParam()
  sendToEveryone?: boolean;
}

/**
 * Translates text from Bokmål to Nynorsk.
 */
@Injectable()
@Command({
  name: 'nbnn',
  description:
    'Omset frå bokmål til nynorsk / Translate from Bokmål to Nynorsk',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class NbnnCommand {
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
    { text, sendToEveryone }: NbnnCommandParams,
  ): Promise<void> {
    await this.translator.translate({
      interaction,
      from: TranslationLanguage.Bokmål,
      to: TranslationLanguage.Nynorsk,
      text,
      ephemeral: !sendToEveryone,
    });
  }
}
