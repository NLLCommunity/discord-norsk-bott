import { Injectable } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import {
  MessageContextMenuCommandInteraction,
  ApplicationCommandType,
} from 'discord.js';
import { TranslatorProvider } from '../../providers';
import { DisplayLanguage, Language } from '../../types';

/**
 * Translates messages to Nynorsk.
 */
@Injectable()
@Command({
  name: 'To Nynorsk',
  type: ApplicationCommandType.Message,
})
export class ToNnCommand {
  constructor(private readonly translator: TranslatorProvider) {}

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await this.translator.translate({
      interaction,
      to: Language.Nynorsk,
      text: interaction.targetMessage.content,
      ephemeral: true,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
