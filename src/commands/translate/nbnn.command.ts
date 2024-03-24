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
import { ShowEveryoneParam } from '../../utils';
import { Language } from '../../types';

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
      from: Language.Bokmål,
      to: Language.Nynorsk,
      text,
      ephemeral: !sendToEveryone,
    });
  }
}
