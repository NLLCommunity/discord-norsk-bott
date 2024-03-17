import { Injectable, Inject, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import {
  ApertiumProvider,
  ApertiumLanguage,
  apertiumLangToLanguage,
} from './apertium.provider';
import { RateLimiterProvider } from './rate-limiter.provider';
import { DeepLProvider } from './deepl.provider';
import { SanitizationProvider } from './sanitization.provider';
import {
  Language,
  DisplayLanguage,
  LanguageName,
  InteractionVariant,
} from '../types';

enum Messages {
  RateLimited,
  TranslationTooLong,
  TranslationError,
  SameLanguageError,
  Translated,
  UsesRemaining,
  DonationPrompt,
  RequestedBy,
  InaccuracyWarning,
}

const timeFormats: Record<DisplayLanguage, Intl.RelativeTimeFormat> = {
  [DisplayLanguage.Norwegian]: new Intl.RelativeTimeFormat('nn-NO', {
    style: 'long',
  }),
  [DisplayLanguage.English]: new Intl.RelativeTimeFormat('en-US', {
    style: 'long',
  }),
};

const formatTime = (ms: number, displayLanguage: DisplayLanguage) => {
  const seconds = Math.round(ms / 1000);

  // use minutes/hours when appropriate

  if (seconds > 60 * 60) {
    return timeFormats[displayLanguage].format(
      Math.round(seconds / (60 * 60)),
      'hour',
    );
  }

  if (seconds > 60) {
    return timeFormats[displayLanguage].format(
      Math.round(seconds / 60),
      'minute',
    );
  }

  return timeFormats[displayLanguage].format(seconds, 'second');
};

const MessageText = {
  [DisplayLanguage.Norwegian]: {
    [Messages.RateLimited]: (waitMs: number) =>
      `Du har brukt denne kommandoen for mykje i det siste. Prøv igjen ${formatTime(
        waitMs,
        DisplayLanguage.Norwegian,
      )}.`,
    [Messages.TranslationTooLong]: () =>
      'Omsett tekst er for lang til å bli sendt. Prøv å korta ned teksten.',
    [Messages.TranslationError]: () =>
      'Det skjedde ein feil under omsetjinga. Prøv igjen seinare.',
    [Messages.SameLanguageError]: () =>
      'Kan ikkje omsetja til same språk som originalteksten.',
    [Messages.Translated]: (from: Language, to: Language) =>
      `Omset frå ${LanguageName[DisplayLanguage.Norwegian][from]} til ${LanguageName[DisplayLanguage.Norwegian][to]}`,
    [Messages.UsesRemaining]: (usesLeft: number) =>
      `Du har ${usesLeft} ${usesLeft === 1 ? 'omsetjing' : 'omsetjingar'} igjen før du må venta ei stund.`,
    [Messages.DonationPrompt]: () =>
      '_Visste du at me betalar for kvar omsetjing?_\n_Hjelp oss med å tilby omsetjingar [ved å donera til Ada](https://github.com/sponsors/adalinesimonian)._',
    [Messages.RequestedBy]: (user: string) => `Spurd av ${user}`,
    [Messages.InaccuracyWarning]: () => '⚠️ Omsetjingane kan innehalda feil.',
  },
  [DisplayLanguage.English]: {
    [Messages.RateLimited]: (waitMs: number) =>
      `You have used this command too much recently. Try again ${formatTime(
        waitMs,
        DisplayLanguage.English,
      )}.`,
    [Messages.TranslationTooLong]: () =>
      'Translated text is too long to be sent. Try shortening the text.',
    [Messages.TranslationError]: () =>
      'An error occurred during translation. Try again later.',
    [Messages.SameLanguageError]: () =>
      'Cannot translate to the same language as the original text.',
    [Messages.Translated]: (from: Language, to: Language) =>
      `Translated from ${LanguageName[DisplayLanguage.English][from]} to ${LanguageName[DisplayLanguage.English][to]}`,
    [Messages.UsesRemaining]: (usesLeft: number) =>
      `You have ${usesLeft} ${usesLeft === 1 ? 'translation' : 'translations'} left before you have to wait a while.`,
    [Messages.DonationPrompt]: () =>
      '_Did you know we pay for every translation?_\n_Help us offer translations by [donating to Ada](https://github.com/sponsors/adalinesimonian)._',
    [Messages.RequestedBy]: (user: string) => `Requested by ${user}`,
    [Messages.InaccuracyWarning]: () => '⚠️ Translations may contain mistakes.',
  },
};

/**
 * Represents the options for the translator.
 */
interface TranslatorOptions {
  /**
   * The interaction object representing the chat input command interaction.
   */
  interaction: InteractionVariant;

  /**
   * The language to translate from.
   */
  from?: Language;

  /**
   * The language to translate to.
   */
  to: Language;

  /**
   * The text to be translated.
   */
  text: string;

  /**
   * (Optional) Whether the response should be ephemeral (only visible to the
   * user who triggered the command). Ignored if the interaction is not a
   * chat input command interaction. Defaults to `true`.
   */
  ephemeral?: boolean;

  /**
   * (Optional) The display language to use. Defaults to
   * {@link DisplayLanguage.Norwegian}.
   */
  displayLanguage?: DisplayLanguage;
}

interface TranslateFunction {
  (str: string): Promise<string>;
}

interface TranslationInfo {
  /**
   * The translation function.
   */
  fn: TranslateFunction;

  /**
   * Whether the translation is expensive, i.e. should be severely rate-limited.
   */
  expensive: boolean;
}

type TranslationGraph = Partial<{
  [sourceLanguageCode in Language]: Partial<{
    [targetLanguageCode in Language]: TranslationInfo;
  }>;
}>;

/**
 * Translates the given text to the given language.
 */
@Injectable()
export class TranslatorProvider {
  constructor(
    @Inject(ApertiumProvider)
    private readonly apertium: ApertiumProvider,
    private readonly deepL: DeepLProvider,
    private readonly rateLimiter: RateLimiterProvider,
    private readonly sanitizer: SanitizationProvider,
  ) {}

  #logger = new Logger(TranslatorProvider.name);

  #translationGraph: TranslationGraph = {
    [Language.Bokmål]: {
      [Language.Nynorsk]: {
        fn: (str) =>
          this.apertium.translate(
            ApertiumLanguage.Bokmål,
            ApertiumLanguage.Nynorsk,
            str,
          ),
        expensive: false,
      },
      [Language.English]: {
        fn: (str) => this.deepL.translate(Language.Bokmål, 'en-US', str),
        expensive: true,
      },
    },
    [Language.Nynorsk]: {
      [Language.Bokmål]: {
        fn: (str) =>
          this.apertium.translate(
            ApertiumLanguage.Nynorsk,
            ApertiumLanguage.Bokmål,
            str,
          ),
        expensive: false,
      },
    },
    [Language.English]: {
      [Language.Bokmål]: {
        fn: (str) =>
          this.deepL.translate(Language.English, Language.Bokmål, str),
        expensive: true,
      },
    },
  };

  #findPath(source: Language, target: Language): Language[] {
    const queue: Language[][] = [[source]];
    const visited = new Set([source]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const lastNode = path[path.length - 1];

      if (lastNode === target) {
        return path;
      }

      const neighbors = Object.keys(this.#translationGraph[lastNode] || {});

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor as Language)) {
          visited.add(neighbor as Language);
          queue.push([...path, neighbor as Language]);
        }
      }
    }

    // Return an empty path if no path is found
    return [];
  }

  #getTranslationPipeline(
    source: Language,
    target: Language,
  ): { expensive: boolean; functions: TranslateFunction[] } {
    const path = this.#findPath(source, target);
    const functions: TranslateFunction[] = [];
    let expensive = false;

    for (let i = 0; i < path.length - 1; i++) {
      const fromLang = path[i];
      const toLang = path[i + 1];
      const { fn, expensive: edgeExpensive } =
        this.#translationGraph[fromLang]![toLang]!;

      if (edgeExpensive) {
        expensive = true;
      }

      functions.push(async (str) => {
        const translated = await fn(str);

        this.#logger.debug(
          `Translated from ${fromLang} to ${toLang}: ${translated}`,
        );

        return translated;
      });
    }

    return { expensive, functions };
  }

  /**
   * Translates the given text to the given language.
   * @param interaction The interaction to reply to.
   * @param from The language to translate from.
   * @param to The language to translate to.
   * @param text The text to translate.
   * @returns The translated text.
   */
  async translate({
    interaction,
    from,
    to,
    text,
    ephemeral = true,
    displayLanguage = DisplayLanguage.Norwegian,
  }: TranslatorOptions): Promise<void> {
    this.#logger.log(`Omset frå ${from} til ${to}: ${text}`);

    const replyFunction:
      | typeof interaction.reply
      | typeof interaction.editReply = (...args: [any]) =>
      'deferred' in interaction && interaction.deferred
        ? interaction.editReply(...args)
        : interaction.reply(...args);

    let sourceLang = from;

    if (!sourceLang) {
      await interaction.deferReply({ ephemeral });
      const detectedLang = await this.apertium.detectLanguage(text);
      sourceLang =
        apertiumLangToLanguage(detectedLang) ??
        // If we can't detect the language, assume it is the opposite of the
        // target language
        (to === Language.English ? Language.Bokmål : Language.English);
    }

    if (sourceLang === to) {
      await replyFunction(
        MessageText[displayLanguage][Messages.SameLanguageError](),
      );
      this.#logger.error(
        `Source language is the same as target language for text: ${text}`,
      );
      return;
    }

    const pipeline = this.#getTranslationPipeline(sourceLang, to);
    const shouldRateLimit = pipeline.expensive || !ephemeral;
    const [rateLimitKey, window, maxPerWindow] = pipeline.expensive
      ? [`${TranslatorProvider.name}-expensive`, 30 * 60 * 1000, 3]
      : [`${TranslatorProvider.name}-cheap`];

    this.#logger.debug(
      `Rate limiting ${shouldRateLimit ? 'enabled' : 'disabled'} for ${rateLimitKey}`,
    );

    const rateLimitInfo = shouldRateLimit
      ? this.rateLimiter.rateLimit(rateLimitKey, interaction, {
          window,
          maxPerWindow,
          byUser: pipeline.expensive,
        })
      : undefined;

    if (rateLimitInfo?.isRateLimited) {
      await replyFunction({
        content:
          ('isPseudoInteraction' in interaction ? `${interaction.user} ` : '') +
          MessageText[displayLanguage][Messages.RateLimited](
            rateLimitInfo.timeUntilNextUse!,
          ),
        ephemeral: true,
      });
      return;
    }

    if (text.length > 1800) {
      await replyFunction({
        content: MessageText[displayLanguage][Messages.TranslationTooLong](),
        ephemeral: true,
      });
      return;
    }

    if ('deferred' in interaction && !interaction.deferred) {
      await interaction.deferReply({
        ephemeral,
      });
    }

    try {
      if (pipeline.functions.length === 0) {
        await interaction.editReply(
          MessageText[displayLanguage][Messages.TranslationError](),
        );
        this.#logger.error(
          `No translation pipeline found from ${from} to ${to}`,
        );
        return;
      }

      let finalText = text;

      for (const translate of pipeline.functions) {
        finalText = await translate(finalText);
      }

      // use embeeds for cleaner output

      const embed = new EmbedBuilder()
        .setTitle(
          MessageText[displayLanguage][Messages.Translated](sourceLang, to),
        )
        .setColor('#00FF00')
        .setDescription(
          this.sanitizer.truncate(this.sanitizer.sanitize(finalText), 1800) +
            (pipeline.expensive && Math.random() < 1 / 3
              ? `\n\n${MessageText[displayLanguage][Messages.DonationPrompt]()}`
              : ''),
        );

      if (rateLimitInfo?.usesLeft !== undefined) {
        embed.setFooter({
          text:
            ('isPseudoInteraction' in interaction
              ? `@${interaction.user.tag} `
              : '') +
            MessageText[displayLanguage][Messages.UsesRemaining](
              rateLimitInfo.usesLeft,
            ) +
            '\n' +
            MessageText[displayLanguage][Messages.InaccuracyWarning](),
        });
      } else if ('isPseudoInteraction' in interaction) {
        embed.setFooter({
          text:
            MessageText[displayLanguage][Messages.RequestedBy](
              interaction.user.tag,
            ) +
            '\n' +
            MessageText[displayLanguage][Messages.InaccuracyWarning](),
        });
      } else {
        embed.setFooter({
          text: MessageText[displayLanguage][Messages.InaccuracyWarning](),
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      this.#logger.error('Feil under omsetjing:', err);
      await replyFunction(
        MessageText[displayLanguage][Messages.TranslationError](),
      );
    }
  }
}
