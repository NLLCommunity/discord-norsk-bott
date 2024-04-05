import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';

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

  /**
   * Summarizes the given content.
   * @param content The content to summarize.
   * @param context Additional context to provide to the model.
   * @returns The summarized content.
   */
  async summarize(
    content: string,
    context?: string,
  ): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk> | null> {
    if (!this.#openAI) {
      return null;
    }

    try {
      const response = await this.#openAI.chat.completions.create({
        model: 'gpt-4-0125-preview',
        n: 1,
        messages: [
          {
            role: 'system',
            content: `Summarize the text given to you, following these guidelines:${context ? `\n${context}\n` : ''}
Your response should be only the summary of the text and should be no longer than 1000 characters.
You should format it suitable for being sent as a Discord message with the limited Markdown support that Discord provides.
It should be clear, concise, easy to follow and understand, and be well-structured/formatted.
Do not include any other text in your response.`,
          },
          {
            role: 'user',
            content,
          },
        ],
        stream: true,
      });

      return response;
    } catch (error) {
      this.#logger.error('Failed to summarize content', error);
      throw error;
    }
  }
}
