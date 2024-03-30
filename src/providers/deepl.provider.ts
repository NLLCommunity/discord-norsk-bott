import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Translator, SourceLanguageCode, TargetLanguageCode } from 'deepl-node';

export enum DeepLSourceLanguage {
  Bokmål = 'nb',
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

export enum DeepLTargetLanguage {
  Bokmål = 'nb',
  English = 'en-US',
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
  Portuguese = 'pt-BR',
  Romanian = 'ro',
  Russian = 'ru',
  Slovak = 'sk',
  Slovenian = 'sl',
  Swedish = 'sv',
  Turkish = 'tr',
  Ukrainian = 'uk',
  Chinese = 'zh',
}

@Injectable()
export class DeepLProvider {
  #translator: Translator;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('DEEPL_APIKEY');

    if (!apiKey) {
      throw new Error('DEEPL_APIKEY is not set');
    }

    this.#translator = new Translator(apiKey);
  }

  /**
   * Translates text using the DeepL API.
   * @param from The language to translate from.
   * @param to The language to translate to.
   * @param text The text to translate.
   * @returns The translated text.
   */
  async translate(
    from: SourceLanguageCode,
    to: TargetLanguageCode,
    text: string,
  ): Promise<string> {
    const { text: translated } = await this.#translator.translateText(
      text,
      from,
      to,
    );

    return translated;
  }
}
