import { Injectable } from '@nestjs/common';

@Injectable()
export class ApertiumProvider {
  readonly #url: string = 'https://apertium.org/apy/translate';

  async #fetch(query: string): Promise<any> {
    const response = await fetch(this.#url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: query,
    });

    const json = await response.json();

    if (json.responseStatus !== 200) {
      throw new Error(json.responseDetails);
    }

    return json;
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

    const response = await this.#fetch(data);
    return response.responseData.translatedText;
  }
}

/**
 * The language codes used by the Apertium API.
 */
export enum ApertiumLanguage {
  Bokmål = 'nob',
  Nynorsk = 'nno',
}
