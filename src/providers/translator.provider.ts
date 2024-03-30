import { Injectable, Inject, Logger } from '@nestjs/common';
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder } from 'discord.js';
import { ApertiumProvider, ApertiumLanguage } from './apertium.provider';
import { RateLimiterProvider } from './rate-limiter.provider';
import {
  DeepLProvider,
  DeepLSourceLanguage,
  DeepLTargetLanguage,
} from './deepl.provider';
import { SanitizationProvider } from './sanitization.provider';
import { ShowEveryoneProvider } from './show-everyone.provider';
import { DisplayLanguage, InteractionVariant } from '../types';

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
  ShowEveryone,
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

// Assuming an enum is 1:1 with each key being unique, gets the name of the key
// from the enum value.
function getEnumKeyByValue<T extends Record<string, string>>(
  enumType: T,
  value: string,
): keyof T | undefined {
  return Object.keys(enumType).find((key) => enumType[key] === value) as
    | keyof T
    | undefined;
}

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
    [Messages.Translated]: (
      from: TranslationLanguage | undefined,
      to: TranslationLanguage,
    ) =>
      `Omset frå ${from ? getEnumKeyByValue(TranslationLanguage, from) : 'Ukjent språk'} til ${getEnumKeyByValue(
        TranslationLanguage,
        to,
      )}`,
    [Messages.UsesRemaining]: (usesLeft: number) =>
      `Du har ${usesLeft} ${usesLeft === 1 ? 'omsetjing' : 'omsetjingar'} igjen før du må venta ei stund.`,
    [Messages.DonationPrompt]: () =>
      '_Visste du at me betalar for kvar omsetjing?_\n_Hjelp oss med å tilby omsetjingar [ved å donera til Ada](https://github.com/sponsors/adalinesimonian)._',
    [Messages.RequestedBy]: (user: string) => `Spurd av ${user}`,
    [Messages.InaccuracyWarning]: () => '⚠️ Omsetjingane kan innehalda feil.',
    [Messages.ShowEveryone]: () => 'Vis til alle',
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
    [Messages.Translated]: (
      from: TranslationLanguage | undefined,
      to: TranslationLanguage,
    ) =>
      `Translated from ${from ? getEnumKeyByValue(TranslationLanguage, from) : 'Unknown language'} to ${getEnumKeyByValue(
        TranslationLanguage,
        to,
      )}`,
    [Messages.UsesRemaining]: (usesLeft: number) =>
      `You have ${usesLeft} ${usesLeft === 1 ? 'translation' : 'translations'} left before you have to wait a while.`,
    [Messages.DonationPrompt]: () =>
      '_Did you know we pay for every translation?_\n_Help us offer translations by [donating to Ada](https://github.com/sponsors/adalinesimonian)._',
    [Messages.RequestedBy]: (user: string) => `Requested by ${user}`,
    [Messages.InaccuracyWarning]: () => '⚠️ Translations may contain mistakes.',
    [Messages.ShowEveryone]: () => 'Show everyone',
  },
};

export enum TranslationLanguage {
  Bokmål = 'nb',
  Nynorsk = 'nn',
  English = 'en',
  Arabic = 'ar',
  Bulgarian = 'bg',
  Czech = 'cs',
  Danish = 'da',
  German = 'de',
  Greek = 'el',
  Spanish = 'es',
  Estonian = 'et',
  Finnish = 'fi',
  French = 'fr',
  Hungarian = 'hu',
  Indonesian = 'id',
  Italian = 'it',
  Japanese = 'ja',
  Korean = 'ko',
  Lithuanian = 'lt',
  Latvian = 'lv',
  Dutch = 'nl',
  Polish = 'pl',
  Portuguese = 'pt',
  Romanian = 'ro',
  Russian = 'ru',
  Slovak = 'sk',
  Slovenian = 'sl',
  Swedish = 'sv',
  Turkish = 'tr',
  Ukrainian = 'uk',
  Chinese = 'zh',
}

type SourceLanguage = TranslationLanguage | 'auto';

export function convertLanguageEnum<
  S extends { [key: string]: string },
  K extends S[keyof S],
  T extends { [key: string]: string },
>(sourceLang: K, sourceEnum: S, targetEnum: T): T[keyof T] | undefined {
  // find the name of the key in the source enum
  const sourceKey = Object.keys(sourceEnum).find(
    (key) => sourceEnum[key as keyof S] === sourceLang,
  );

  if (!sourceKey) {
    return undefined;
  }

  // find the key in the target enum
  const targetKey = Object.keys(targetEnum).find((key) => key === sourceKey);

  return targetKey ? targetEnum[targetKey as keyof T] : undefined;
}

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
  from?: TranslationLanguage;

  /**
   * The language to translate to.
   */
  to: TranslationLanguage;

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
interface TranslationResult {
  text: string;
  detected?: TranslationLanguage;
}

interface TranslateFunction {
  (str: string): Promise<TranslationResult>;
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
  [sourceLanguageCode in SourceLanguage]: Partial<{
    [targetLanguageCode in SourceLanguage]: TranslationInfo;
  }>;
}>;

type Translator<
  S extends SourceLanguage = SourceLanguage,
  T extends TranslationLanguage = TranslationLanguage,
> = {
  from: S[];
  to: T[];
  translate: (from: S, to: T, str: string) => Promise<TranslationResult>;
  expensive: boolean;
};

type Translators = Translator[];

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
    private readonly showEveryone: ShowEveryoneProvider,
  ) {}

  #logger = new Logger(TranslatorProvider.name);

  #translators: Translators = [
    {
      from: (
        Object.values(DeepLSourceLanguage)
          .map((lang) =>
            convertLanguageEnum(lang, DeepLSourceLanguage, TranslationLanguage),
          )
          .filter((lang) => lang) as SourceLanguage[]
      ).concat('auto'),
      to: Object.values(DeepLTargetLanguage)
        .map((lang) =>
          convertLanguageEnum(lang, DeepLTargetLanguage, TranslationLanguage),
        )
        .filter((lang) => lang) as TranslationLanguage[],
      translate: async (from, to, str) => {
        const fromLang =
          from === 'auto'
            ? null
            : convertLanguageEnum(
                from,
                TranslationLanguage,
                DeepLSourceLanguage,
              ) ?? null;
        const toLang = convertLanguageEnum(
          to,
          TranslationLanguage,
          DeepLTargetLanguage,
        );

        if (!toLang) {
          throw new Error(`Invalid language code: ${to}`);
        }

        const { text, detectedSourceLang } = await this.deepL.translate(
          fromLang,
          toLang,
          str,
        );

        return {
          text,
          detected: convertLanguageEnum(
            detectedSourceLang as DeepLSourceLanguage,
            DeepLSourceLanguage,
            TranslationLanguage,
          ),
        };
      },
      expensive: true,
    },
    {
      from: [TranslationLanguage.Bokmål, TranslationLanguage.Nynorsk],
      to: [TranslationLanguage.Bokmål, TranslationLanguage.Nynorsk],
      translate: async (from, to, str) => {
        const fromLang = convertLanguageEnum(
          from as TranslationLanguage,
          TranslationLanguage,
          ApertiumLanguage,
        );
        const toLang = convertLanguageEnum(
          to,
          TranslationLanguage,
          ApertiumLanguage,
        );

        if (!fromLang || !toLang) {
          throw new Error(`Invalid language code: ${from} or ${to}`);
        }

        return { text: await this.apertium.translate(fromLang, toLang, str) };
      },
      expensive: false,
    },
  ];

  #buildTranslationGraph(): TranslationGraph {
    const graph: TranslationGraph = {};

    for (const translator of this.#translators) {
      for (const sourceLanguage of translator.from) {
        let node = graph[sourceLanguage];

        if (!node) {
          node = {};
          graph[sourceLanguage] = node;
        }

        for (const targetLanguage of translator.to) {
          // Avoid translating a language to itself
          if (sourceLanguage !== targetLanguage) {
            node[targetLanguage] = {
              fn: (str: string) =>
                translator.translate(sourceLanguage, targetLanguage, str),
              expensive: translator.expensive,
            };
          }
        }
      }
    }

    return graph;
  }

  #translationGraph: TranslationGraph = this.#buildTranslationGraph();

  #findPath(
    source: SourceLanguage,
    target: TranslationLanguage,
  ): SourceLanguage[] {
    const queue: SourceLanguage[][] = [[source]];
    const visited = new Set([source]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const lastNode = path[path.length - 1];

      if (lastNode === target) {
        return path;
      }

      const neighbors = Object.keys(this.#translationGraph[lastNode] || {});

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor as TranslationLanguage)) {
          visited.add(neighbor as TranslationLanguage);
          queue.push([...path, neighbor as TranslationLanguage]);
        }
      }
    }

    // Return an empty path if no path is found
    return [];
  }

  #getTranslationPipeline(
    source: SourceLanguage,
    target: TranslationLanguage,
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

    let sourceLang = from as SourceLanguage | undefined;

    if (!sourceLang) {
      await interaction.deferReply({ ephemeral });
      const detectedLang = await this.apertium.detectLanguage(text);
      sourceLang =
        convertLanguageEnum(
          detectedLang as ApertiumLanguage,
          ApertiumLanguage,
          TranslationLanguage,
        ) ?? 'auto';
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
      let detectedLang: TranslationLanguage | undefined = undefined;

      for (const translate of pipeline.functions) {
        const result = await translate(finalText);

        finalText = result.text;
        if (!detectedLang) {
          detectedLang = result.detected ?? detectedLang;
        }
      }

      // use embeeds for cleaner output

      const embed = new EmbedBuilder()
        .setTitle(
          MessageText[displayLanguage][Messages.Translated](
            sourceLang === 'auto' ? detectedLang : sourceLang,
            to,
          ),
        )
        .setColor('#00FF00')
        .setDescription(
          this.sanitizer.truncate(this.sanitizer.sanitize(finalText), 1800) +
            (pipeline.expensive && Math.random() < 1 / 3
              ? `\n\n${MessageText[displayLanguage][Messages.DonationPrompt]()}`
              : ''),
        );

      // Add a button to send the message to the channel for everyone to see,
      // if the message is ephemeral and sent to a guild channel

      const components: ActionRowBuilder<ButtonBuilder>[] = [];

      if (
        ephemeral && // Only show the button if the message is ephemeral
        interaction.channel && // Ensure the interaction has a channel
        'name' in interaction.channel &&
        interaction.channel.name // Ensure the channel is a guild channel
      ) {
        components.push(this.showEveryone.getActionRow(displayLanguage));
      }

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

      await interaction.editReply({ embeds: [embed], components });
    } catch (err) {
      this.#logger.error('Feil under omsetjing:', err);
      await replyFunction(
        MessageText[displayLanguage][Messages.TranslationError](),
      );
    }
  }
}
