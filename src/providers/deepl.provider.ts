import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Translator, SourceLanguageCode, TargetLanguageCode } from 'deepl-node';

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
