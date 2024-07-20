import { Language } from './languages.js';

/**
 * Emojis for a language.
 */
export interface LanguageEmojis {
  /** The language the emojis are for. */
  language: Language;

  /** The emoji used by users to translate to the language. */
  translate: string;

  /** The emoji used by the bot to indicate it has translated to the language. */
  done: string;
}

/**
 * Emojis used for reaction-triggered translation.
 */
export const TranslationEmojis: Record<
  Language,
  Omit<LanguageEmojis, 'language'>
> = {
  [Language.English]: {
    translate: 'translateen',
    done: 'translateendone',
  },
  [Language.Bokmål]: {
    translate: 'translatenb',
    done: 'translatenbdone',
  },
  [Language.Nynorsk]: {
    translate: 'translatenn',
    done: 'translatenndone',
  },
};

/**
 * Get the emoji data by emoji name.
 * @param emoji The emoji name.
 * @param kind Optionally, the kind of emoji to check for. If not provided, any
 * emoji in the data will match.
 * @returns The emoji data.
 */
export function getEmojiData(
  emoji: string,
  kind?: keyof Omit<LanguageEmojis, 'language'>,
): LanguageEmojis | undefined {
  for (const [language, data] of Object.entries(TranslationEmojis)) {
    if (kind) {
      if (data[kind] === emoji) {
        return { language: language as Language, ...data };
      }

      continue;
    }

    for (const value of Object.values(data)) {
      if (value === emoji) {
        return { language: language as Language, ...data };
      }
    }
  }

  return undefined;
}
