import { Injectable } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import {
  MessageContextMenuCommandInteraction,
  ApplicationCommandType,
  PermissionFlagsBits,
} from 'discord.js';
import {
  TranslatorProvider,
  TranslationLanguage,
} from '../../providers/index.js';
import { DisplayLanguage } from '../../types/index.js';

/**
 * Translates messages to Bokmål.
 */
@Injectable()
@Command({
  name: 'To Bokmål',
  type: ApplicationCommandType.Message,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class ToNbCommand {
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
      to: TranslationLanguage.Bokmål,
      text: interaction.targetMessage.content,
      ephemeral: true,
      displayLanguage: DisplayLanguage.English,
    });
  }
}
