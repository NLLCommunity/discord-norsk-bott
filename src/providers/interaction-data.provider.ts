import { Injectable } from '@nestjs/common';
import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';

export interface InteractionData {
  getChannelName: () => string;
  isModerator: () => boolean;
}

@Injectable()
export class InteractionDataProvider {
  /**
   * Gets interaction data.
   * @param interaction The interaction to get data for.
   * @returns The interaction data.
   */
  getDataFor(interaction: ChatInputCommandInteraction): InteractionData {
    return {
      getChannelName: () =>
        interaction.channel && 'name' in interaction.channel
          ? `#${interaction.channel.name}`
          : 'DM',
      isModerator: () => {
        const { permissions } = interaction.member ?? {};

        if (
          permissions &&
          typeof permissions === 'object' &&
          'has' in permissions &&
          (permissions.has(PermissionFlagsBits.KickMembers) ||
            permissions.has(PermissionFlagsBits.BanMembers))
        ) {
          return true;
        }

        return false;
      },
    };
  }
}
