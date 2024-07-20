import { CanActivate, ExecutionContext } from '@nestjs/common';
import { MessageReaction, PartialMessageReaction } from 'discord.js';
import { getEmojiData } from '../../types/index.js';

export class IsTranslateEmojiGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reaction = context.getArgByIndex(0) as
      | MessageReaction
      | PartialMessageReaction;

    if (
      !reaction.emoji.name ||
      !('guild' in reaction.emoji) ||
      reaction.emoji.guild.id !== reaction.message.guild?.id
    ) {
      return false;
    }

    return Boolean(getEmojiData(reaction.emoji.name, 'translate'));
  }
}
