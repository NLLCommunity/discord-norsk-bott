import { Injectable } from '@nestjs/common';
import { Command } from '@discord-nestjs/core';
import { SyncSubCommand } from './sync.command';

@Injectable()
@Command({
  name: 'notion',
  description: 'Interacts with the Notion integration',
  include: [SyncSubCommand],
})
export class NotionCommand {}
