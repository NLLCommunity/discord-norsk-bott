import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { ClientEvents, Events } from 'discord.js';
import { PosthogProvider, PosthogEvent } from '../providers/index.js';

@Injectable()
export class CommandEventLogHandler {
  #logger = new Logger(CommandEventLogHandler.name);

  constructor(private readonly posthog: PosthogProvider) {}

  @On(Events.InteractionCreate)
  async handleInteractionCreate(
    ...eventArgs: ClientEvents['interactionCreate']
  ) {
    const [interaction] = eventArgs;

    this.#logger.log(
      `Received interaction: ${
        interaction.guildId ? `[${interaction.guild?.name}]` : '[DM]'
      } ${interaction.user.tag}${
        interaction.channel && !interaction.channel.isDMBased()
          ? ` in channel #${interaction.channel.name}`
          : ''
      }${
        interaction.isCommand()
          ? ` used command ${interaction.commandName}`
          : ''
      }`,
    );

    this.posthog.client?.capture({
      distinctId: interaction.user.id,
      event: PosthogEvent.Interaction,
      properties: {
        interactionId: interaction.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        commandName: interaction.isCommand()
          ? interaction.commandName
          : undefined,
        commandId: interaction.isCommand() ? interaction.commandId : undefined,
      },
      timestamp: new Date(interaction.createdTimestamp),
      sendFeatureFlags: true,
    });
    this.posthog.client?.capture({
      distinctId: interaction.user.id,
      event: PosthogEvent.SetPersonProperties,
      properties: {
        $set: {
          name: interaction.user.displayName,
          username: interaction.user.username,
          lastInteraction: new Date(interaction.createdTimestamp),
        },
      },
    });
  }
}
