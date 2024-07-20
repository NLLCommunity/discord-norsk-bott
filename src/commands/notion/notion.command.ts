import { Injectable } from '@nestjs/common';
import { Command } from '@discord-nestjs/core';
import { SyncSubCommand } from './sync.command.js';
import { PermissionFlagsBits } from 'discord.js';

@Injectable()
@Command({
  name: 'notion',
  description: 'Interacts with the Notion integration',
  include: [SyncSubCommand],
  defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
})
export class NotionCommand {}
