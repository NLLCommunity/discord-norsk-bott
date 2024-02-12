import querystring from 'querystring';

export class ApertiumService {
  constructor() {
    this.url = 'https://apertium.org/apy/translate';
  }

  async fetch(query) {
    const response = await fetch(this.url, {
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
   * Translate text using the Apertium API
   * @param {Language} from The language to translate from
   * @param {Language} to The language to translate to
   * @param {string} text The text to translate
   */
  async translate(from, to, text) {
    const data = querystring.stringify({
      langpair: `${from}|${to}`,
      markUnknown: 'no',
      prefs: '',
      q: text,
    });

    const response = await this.fetch(data);
    return response.responseData.translatedText;
  }
}

/**
 * Language codes
 * @enum {string}
 */
export const Language = {
  Bokmål: 'nob',
  Nynorsk: 'nno',
};
