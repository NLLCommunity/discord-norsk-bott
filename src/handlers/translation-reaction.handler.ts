import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { Client, Events, Message, MessageReaction, User } from 'discord.js';
import {
  FetchedReactionGuard,
  IsTranslateEmojiGuard,
  OnlyStandardChannelsGuard,
  ReactionInServerGuard,
  ReactionOnUserMessageGuard,
} from './guards';
import {
  TranslationEmojis,
  Language,
  getEmojiData,
  interactionFromReaction,
  DisplayLanguage,
} from '../types';
import {
  ApertiumProvider,
  TranslatorProvider,
  apertiumLangToLanguage,
} from '../providers';
import { UserHasPermissionsGuard } from './guards/user-has-permissions.guard';

@Injectable()
export class TranslationReactionHandler {
  readonly #logger = new Logger(TranslationReactionHandler.name);

  constructor(
    @InjectDiscordClient()
    private readonly client: Client,
    private readonly translator: TranslatorProvider,
    private readonly apertium: ApertiumProvider,
  ) {}

  /** Set of translations that are currently being translated */
  #inProgressTranslations = new Set<string>();

  #getInProgressTranslationsKey(message: Message, language: Language) {
    return `${message.id}-${language}`;
  }

  #shouldSkipTranslation(message: Message, language: Language) {
    const key = this.#getInProgressTranslationsKey(message, language);

    if (this.#inProgressTranslations.has(key)) {
      return true;
    }

    // Otherwise, check to see if the bot has already translated the message by
    // seeing if it has responded with the "done" reaction emoji for the given
    // language

    const doneEmoji = TranslationEmojis[language].done;

    return message.reactions.cache.some(
      (reaction) => reaction.emoji.name === doneEmoji && reaction.me,
    );
  }

  @On(Events.MessageReactionAdd)
  @UseGuards(
    IsTranslateEmojiGuard,
    FetchedReactionGuard,
    ReactionInServerGuard,
    ReactionOnUserMessageGuard,
    OnlyStandardChannelsGuard,
    UserHasPermissionsGuard,
  )
  async onMessageReactionAdd(
    reaction: MessageReaction,
    user: User,
  ): Promise<void> {
    const message = reaction.message as Message;
    const emojiData = getEmojiData(reaction.emoji.name!, 'translate')!;

    if (this.#shouldSkipTranslation(message, emojiData.language)) {
      this.#logger.debug(
        `Translation for message ${message.id} to ${emojiData.language} is already in progress or done, skipping`,
      );
      await reaction.users.remove(user);
      return;
    }

    const inProgressKey = this.#getInProgressTranslationsKey(
      message,
      emojiData.language,
    );
    const doneEmoji = message.guild?.emojis.cache.find(
      (emoji) => emoji.name === emojiData.done,
    );

    this.#inProgressTranslations.add(inProgressKey);

    this.#logger.log(
      `User ${user.tag} requested translation for message ${message.id} to ${emojiData.language}`,
    );

    const detectedLang = await this.apertium.detectLanguage(message.content);
    const sourceLang =
      apertiumLangToLanguage(detectedLang) ??
      // If we can't detect the language, assume it is the opposite of the
      // target language
      (emojiData.language === Language.English
        ? Language.Bokmål
        : Language.English);

    if (sourceLang === emojiData.language) {
      this.#logger.debug(
        `Source language is the same as target language for message ${message.id}, not translating`,
      );
      if (doneEmoji) {
        await message.react(doneEmoji);
      }
      await reaction.users.remove(user);
      this.#inProgressTranslations.delete(inProgressKey);
      return;
    }

    const interaction = interactionFromReaction(reaction, user);

    await this.translator.translate({
      from: sourceLang,
      to: emojiData.language,
      text: message.content,
      interaction,
      displayLanguage: DisplayLanguage.English,
      ephemeral: false,
    });

    // Add the corresponding "done" reaction to the message and remove the
    // "in progress" translation emoji and flag

    if (doneEmoji) {
      await message.react(doneEmoji);
    }
    await reaction.remove();
    this.#inProgressTranslations.delete(inProgressKey);
  }
}
