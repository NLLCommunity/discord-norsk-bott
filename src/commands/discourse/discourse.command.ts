import { Injectable } from '@nestjs/common';
import { Command } from '@discord-nestjs/core';
import { DiscourseSyncSubCommand } from './sync.command.js';
import { PermissionFlagsBits } from 'discord.js';

@Injectable()
@Command({
  name: 'discourse',
  description: 'Interacts with the Discourse integration',
  include: [DiscourseSyncSubCommand],
  defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
  descriptionLocalizations: {
    no: 'Handterer Discourse-integrasjonen',
  },
})
export class DiscourseCommand {}
