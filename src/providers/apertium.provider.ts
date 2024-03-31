import { Injectable } from '@nestjs/common';
import { Language } from '../types';

export interface LanguageCandidate {
  language: ApertiumLanguage;
  confidence: number;
}

@Injectable()
export class ApertiumProvider {
  readonly #baseUrl: string = 'https://apertium.org/apy/';

  async #fetch(endpoint: string, query: string): Promise<any> {
    const response = await fetch(this.#baseUrl + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: query,
    });

    return await response.json();
  }

  /**
   * Translates text using the Apertium API.
   * @param from The language to translate from.
   * @param to The language to translate to.
   * @param text The text to translate.
   * @returns The translated text.
   */
  async translate(
    from: ApertiumLanguage,
    to: ApertiumLanguage,
    text: string,
  ): Promise<string> {
    const data = new URLSearchParams({
      langpair: `${from}|${to}`,
      markUnknown: 'no',
      prefs: '',
      q: text,
    }).toString();

    const response = await this.#fetch('translate', data);

    if (response.responseStatus !== 200) {
      throw new Error(response.responseDetails);
    }

    return response.responseData.translatedText;
  }

  /**
   * Detects the language of the given text using the Apertium API.
   * @param text The text to detect the language of.
   * @returns The detected language.
   */
  async detectLanguage(text: string): Promise<string> {
    const data = new URLSearchParams({ q: text }).toString();

    const response = (await this.#fetch('identifyLang', data)) as {
      [langId: string]: number;
    };

    const mostLikely = Object.entries(response).reduce((a, b) =>
      a[1] > b[1] ? a : b,
    );

    return mostLikely[0];
  }

  /**
   * Returns an array of languages that the given text could be along with their
   * confidence levels. The array is sorted by confidence in descending order,
   * with the most likely language first.
   * @param text The text to detect the language of.
   * @returns An array of language candidates.
   */
  async detectLanguages(text: string): Promise<LanguageCandidate[]> {
    const data = new URLSearchParams({ q: text }).toString();

    const response = (await this.#fetch('identifyLang', data)) as {
      [langId: string]: number;
    };

    return Object.entries(response)
      .map(([language, confidence]) => ({
        language: language as ApertiumLanguage,
        confidence,
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }
}

/**
 * The language codes used by the Apertium API.
 */
export enum ApertiumLanguage {
  Bokmål = 'nob',
  Nynorsk = 'nno',
  English = 'eng',
  Afrikaans = 'afr',
  Aragonese = 'arg',
  Belarusian = 'bel',
  CrimeanTatar = 'crh',
  Danish = 'dan',
  German = 'deu',
  French = 'fra',
  FrancoProvencal = 'frp',
  Indonesian = 'ind',
  Icelandic = 'isl',
  Kazakh = 'kaz',
  Dutch = 'nld',
  Occitan = 'oci',
  OccitanGascon = 'oci_gascon',
  Portuguese = 'por',
  Romanian = 'ron',
  Russian = 'rus',
  Spanish = 'spa',
  Swedish = 'swe',
  Turkish = 'tur',
  Ukrainian = 'ukr',
  Urdu = 'urd',
  Malay = 'zlm',
  Catalan = 'cat',
  Italian = 'ita',
  Sardinian = 'srd',
}

/**
 * Returns the Language enum value for the given Apertium language code.
 */
export function apertiumLangToLanguage(code: string): Language | undefined {
  switch (code) {
    case ApertiumLanguage.Bokmål:
      return Language.Bokmål;

    case ApertiumLanguage.Nynorsk:
      return Language.Nynorsk;

    case ApertiumLanguage.English:
      return Language.English;

    default:
      return undefined;
  }
}
