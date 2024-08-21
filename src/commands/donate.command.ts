import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import {
  type ChatInputCommandInteraction,
  Locale,
  PermissionFlagsBits,
} from 'discord.js';
import { createi18n } from '../utils/index.js';

const messages = {
  [Locale.Norwegian]: {
    donate:
      'Ein personleg takk frå meg, Ada, for at du er interessert i å støtte Norsk-bott. ' +
      'Du kan donere til meg på [GitHub Sponsors](https://github.com/sponsors/adalinesimonian).\n\n' +
      'Med å donere hjelper du halde botten tilgjengeleg og gratis for alle. Takk skal du ha! ❤️',
  },
  [Locale.EnglishUS]: {
    donate:
      'A personal thank you from me, Ada, for being interested in supporting Norsk-bott. ' +
      'You can donate to me on [GitHub Sponsors](https://github.com/sponsors/adalinesimonian).\n\n' +
      'By donating, you help keep the bot available and free for everyone. Thank you! ❤️',
  },
};

const i18n = createi18n(messages, Locale.EnglishUS);

/**
 * A command for showing a donation message.
 */
@Injectable()
@Command({
  name: 'donate',
  nameLocalizations: {
    [Locale.Norwegian]: 'doner',
  },
  description: 'Donate to Norsk-bott.',
  descriptionLocalizations: {
    [Locale.Norwegian]: 'Doner til Norsk-bott.',
  },
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class DonateCommand {
  #logger = new Logger(DonateCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param messageId The ID of the message to quote.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.reply({
      content: i18n(interaction.locale, 'donate'),
      ephemeral: true,
    });
  }
}
