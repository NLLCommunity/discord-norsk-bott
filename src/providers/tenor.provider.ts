import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TenorProvider {
  readonly #apiKey: string;

  constructor(configService: ConfigService) {
    this.#apiKey = configService.get<string>('TENOR_API_KEY') ?? '';
  }

  get isConfigured(): boolean {
    return Boolean(this.#apiKey);
  }

  /**
   * Checks if the given text contains a link to a GIF hosted on Tenor. If it
   * does, returns the URL for the image.
   * @param text The text to check for a GIF link.
   */
  async getGifUrl(text: string): Promise<string | null> {
    if (!this.#apiKey) {
      return null;
    }

    const tenorGifRegex = /https?:\/\/tenor\.com\/view\/[^/]+-([0-9]+)/;
    const match = text.match(tenorGifRegex);

    if (!match) {
      return null;
    }

    const gifId = match[1];
    const response = await fetch(
      `https://tenor.googleapis.com/v2/posts?ids=${gifId}&key=${this.#apiKey}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      results: {
        media_formats: { gif: { url: string } };
      }[];
    };

    if (!data.results || data.results.length === 0) {
      return null;
    }

    return data.results[0].media_formats.gif.url;
  }
}
