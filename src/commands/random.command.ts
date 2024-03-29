import { Injectable, Logger } from '@nestjs/common';
import {
  Command,
  Handler,
  InteractionEvent,
  Param,
  ParamType,
} from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import {
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { RateLimiterProvider } from '../providers';
import { ShowEveryoneParamEn } from '../utils';

export class RandomCommandParams {
  @Param({
    name: 'roll',
    description:
      'The roll to make. Range (e.g. 1-100) or D&D-style roll (d20, 3d6), with optional modifier (e.g. +5).',
    type: ParamType.STRING,
    required: true,
  })
  roll: string;

  @ShowEveryoneParamEn()
  sendToEveryone?: boolean;
}

/**
 * A command for getting a random number/roll.
 */
@Injectable()
@Command({
  name: 'random',
  description: 'Gets a random number/roll',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class RandomCommand {
  #logger = new Logger(RandomCommand.name);

  constructor(private readonly rateLimiter: RateLimiterProvider) {}

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param roll The roll to make.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { roll, sendToEveryone }: RandomCommandParams,
  ): Promise<void> {
    this.#logger.log(`Rolling ${roll.slice(0, 100)}`);

    if (
      sendToEveryone &&
      this.rateLimiter.isRateLimited(RandomCommand.name, interaction)
    ) {
      return;
    }

    const match = roll.match(
      /^\s*(?:(\d{1,3})\s*-\s*(\d{1,3})|(\d{1,3})?d(\d{1,3}))\s*(?:([+-])\s*(\d{1,3}))?\s*$/i,
    );

    if (!match) {
      await interaction.reply({
        content:
          'Invalid roll format. Please use `<min>-<max>` or `[num]d<sides> [+|- <modifier>]`. Numbers must be between 0 and 999.',
        ephemeral: true,
      });
      return;
    }

    let baseRoll: number;

    if (match[1] !== undefined) {
      const min = Number.parseInt(match[1], 10);
      const max = Number.parseInt(match[2], 10);
      baseRoll = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      const num = match[3] === undefined ? 1 : Number.parseInt(match[3], 10);
      const sides = Number.parseInt(match[4], 10);
      baseRoll = 0;
      for (let i = 0; i < num; i++) {
        baseRoll += Math.floor(Math.random() * sides) + 1;
      }
    }

    const hasModifier = match[5] !== undefined;
    const modifier = hasModifier ? Number.parseInt(match[6], 10) : 0;
    const total = baseRoll + (match[5] === '-' ? -modifier : modifier);

    // clean up the roll string, e.g.
    // "1-100+5" -> "1-100 + 5", "d6  -  2" -> "1d6 - 2"
    const standardizedBaseRoll =
      match[1] !== undefined
        ? `${match[1]}-${match[2]}`
        : `${match[3] === undefined ? '1' : match[3]}d${match[4]}`;

    const standardizedModifier = hasModifier
      ? ` ${match[5] === '-' ? '-' : '+'} ${match[6]}`
      : '';

    const standardizedRoll = `${standardizedBaseRoll}${standardizedModifier}`;

    const embed = new EmbedBuilder()
      .setTitle(`Rolled ${standardizedRoll}`)
      .addFields(
        ...(hasModifier
          ? [
              { name: 'Base Roll', value: baseRoll.toString(), inline: true },
              {
                name: 'Modifier',
                value: `\\${match[5]} ${modifier}`,
                inline: true,
              },
              { name: 'Total', value: total.toString() },
            ]
          : [{ name: 'Result', value: baseRoll.toString() }]),
      )
      .setColor(0x00ff00);

    await interaction.reply({ embeds: [embed], ephemeral: !sendToEveryone });
  }
}
