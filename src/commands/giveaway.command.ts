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
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  User,
} from 'discord.js';
import {
  InteractionDataProvider,
  GuildButtonCollectorProvider,
} from '../providers/index.js';

export class GiveawayCommandParams {
  @Param({
    name: 'description',
    description: 'What the giveaway is for',
    type: ParamType.STRING,
    required: true,
  })
  description: string;
}

/**
 * A command for starting a giveaway.
 */
@Injectable()
@Command({
  name: 'giveaway',
  description: 'Starts a giveaway',
  defaultMemberPermissions: PermissionFlagsBits.KickMembers,
})
export class GiveawayCommand {
  #logger = new Logger(GiveawayCommand.name);

  constructor(
    private interactionData: InteractionDataProvider,
    guildCollectors: GuildButtonCollectorProvider,
  ) {
    guildCollectors.addHandler('endgiveaway', (interaction) =>
      this.#handleEndGiveaway(interaction),
    );
  }

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param messageId The ID of the message to quote.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { description }: GiveawayCommandParams,
  ): Promise<void> {
    this.#logger.log(`Starting giveaway for ${description}`);

    if (!this.interactionData.getDataFor(interaction).isModerator()) {
      await interaction.reply({
        content: 'You do not have permission to start a giveaway.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

    try {
      const endButton = new ButtonBuilder()
        .setCustomId('endgiveaway')
        .setLabel('End Giveaway')
        .setStyle(ButtonStyle.Danger);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        endButton,
      );

      const giveawayMessage = await interaction.reply({
        content: `🎉 **GIVEAWAY** 🎉

React with 🎉 to enter!

**Prize**: ${description}

To be eligible to win, you must have been in the server for at least 1 month.`,
        fetchReply: true,
        components: [actionRow],
      });

      await giveawayMessage.react('🎉');
    } catch (error) {
      this.#logger.error(error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: 'An error occurred while starting the giveaway.',
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while starting the giveaway.',
          ephemeral: true,
        });
      }
    }
  }

  /**
   * Handles ending a giveaway.
   * @param interaction The interaction event.
   */
  async #handleEndGiveaway(interaction: ButtonInteraction) {
    this.#logger.log(`Ending giveaway`);

    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== interaction.message.interaction?.user.id) {
      await interaction.reply({
        content: 'Only the user who started the giveaway can end it.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const { message } = interaction;

    try {
      const reactions = (await message.fetch()).reactions.cache.get('🎉');
      if (!reactions) {
        await interaction.editReply({
          content: 'No one entered the giveaway.',
        });
        return;
      }

      const users = (await reactions.users.fetch())
        .toJSON()
        .filter((user) => user.bot === false);

      let winner: User | null = null;

      const now = Date.now();

      while (users.length > 0 && !winner) {
        // Randomly select a user and splice them from the array
        const index = Math.floor(Math.random() * users.length);
        winner = users.splice(index, 1)[0];

        const winnerGuildMember =
          interaction.guild.members.cache.get(winner.id) ||
          (await interaction.guild.members.fetch(winner.id));

        // Check if the user:
        // - Is not the user who started the giveaway
        // - Is still in the server
        // - Has been in the server for at least 1 month

        if (
          winner.id === interaction.message.interaction?.user.id ||
          !winnerGuildMember?.joinedTimestamp ||
          now - winnerGuildMember.joinedTimestamp < 30 * 24 * 60 * 60 * 1000 // 30 days
        ) {
          this.#logger.debug(`User ${winner.tag} is not eligible to win`);
          winner = null;
        }
      }

      if (!winner) {
        await interaction.editReply({
          content:
            'No eligible winners found or no one entered the giveaway. 😢',
        });
        return;
      }

      await interaction.editReply({
        content: `🎉 **GIVEAWAY ENDED** 🎉\n\n**Winner**: ${winner}`,
      });

      // Remove the end giveaway button
      await message.edit({
        components: [],
      });
    } catch (error) {
      this.#logger.error('Failed to end giveaway', error);
      await interaction.editReply({
        content: 'An error occurred while ending the giveaway.',
      });
    }
  }
}
