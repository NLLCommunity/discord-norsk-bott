import { Injectable } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import {
  MessageContextMenuCommandInteraction,
  ApplicationCommandType,
  PermissionFlagsBits,
} from 'discord.js';
import { TranslatorProvider, TranslationLanguage } from '../../providers';
import { DisplayLanguage } from '../../types';

/**
 * Translates messages to English.
 */
@Injectable()
@Command({
  name: 'To English',
  type: ApplicationCommandType.Message,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class ToEnCommand {
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
      to: TranslationLanguage.English,
      text: interaction.targetMessage.content,
      ephemeral: true,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
