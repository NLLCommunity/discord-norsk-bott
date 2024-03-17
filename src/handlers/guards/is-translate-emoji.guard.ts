import { CanActivate, ExecutionContext } from '@nestjs/common';
import { MessageReaction, PartialMessageReaction } from 'discord.js';
import { getEmojiData } from '../../types';

export class IsTranslateEmojiGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reaction = context.getArgByIndex(0) as
      | MessageReaction
      | PartialMessageReaction;

    if (!reaction.emoji.name) {
      return false;
    }

    return Boolean(getEmojiData(reaction.emoji.name, 'translate'));
  }
}
