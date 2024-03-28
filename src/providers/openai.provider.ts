import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';

@Injectable()
export class OpenAiProvider {
  readonly #openAI?: OpenAI;
  readonly #logger = new Logger(OpenAiProvider.name);

  constructor(private configService: ConfigService) {
    const openAIKey = this.configService.get<string>('OPENAI_API_KEY');

    if (openAIKey) {
      this.#openAI = new OpenAI({ apiKey: openAIKey, fetch });
    }
  }

  get openAI(): OpenAI | undefined {
    return this.#openAI;
  }

  get isAvailable(): boolean {
    return Boolean(this.#openAI);
  }

  /**
   * Gauge whether or not the content is appropriate for a general audience. In
   * other words, is the content inoffensive and safe for work?
   */
  async isSafeForWork(content: string): Promise<boolean> {
    if (!this.#openAI) {
      return false;
    }

    try {
      const response = await this.#openAI.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You will be given JSON or text data. Classify its contents into either "safe" or "unsafe".
"safe" means the text is appropriate for a general audience.
"unsafe" means the text is inappropriate for a general audience (e.g. contains profanity, sexual content, hate speech, or other offensive content).
Only respond with "safe" or "unsafe" — do not include any other text in your response.`,
          },
          {
            role: 'user',
            content,
          },
        ],
        n: 1,
      });

      return response.choices[0].message.content === 'safe' ? true : false;
    } catch (error) {
      this.#logger.error('Failed to check if content is safe for work', error);
      throw error;
    }
  }
}
