import { Injectable, Logger } from '@nestjs/common';
import { Stream } from 'openai/streaming';
import { OpenAiProvider } from './openai.provider';
import { OrdbokApiProvider } from './ordbokapi.provider';
import { DisplayLanguage } from '../types';
import { Dictionary } from '../gql/graphql';
import {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources';

@Injectable()
export class ExplanationProvider {
  readonly #logger = new Logger(ExplanationProvider.name);

  constructor(
    private readonly openAi: OpenAiProvider,
    private readonly ordbokApi: OrdbokApiProvider,
  ) {}

  get isAvailable(): boolean {
    return this.openAi.isAvailable;
  }

  /**
   * Explain the content provided.
   * @param content The content to explain.
   * @param language The language to use for the explanation.
   * @param context Additional context to provide to the model.
   * @returns The explanation of the content.
   */
  async explain(
    content: string,
    language = DisplayLanguage.English,
    context?: string,
  ): Promise<Stream<ChatCompletionChunk> | null> {
    const { client } = this.openAi;

    if (!client) {
      return null;
    }

    const instructions =
      language === DisplayLanguage.English
        ? `You are an AI language model that has been trained to help language learners with Norwegian.
You will be given a piece of text. It will either be:
- A question, which you should answer.
- A Norwegian word or phrase, which you should explain in English.
You have the ability to look up information from the official Norwegian dictionaries: Bokmålsordboka and Nynorskordboka.
In order to look up a word or phrase, you should send a message that contains only !lookup followed by the word or phrase you want to look up.
For example, if you want to look up the word "hund", you should send the message !lookup hund.
You can only look up one word or phrase at a time, and you should not include any other text in your message.
If you are given a question, you should provide a clear, concise, and accurate answer.
If you are given a word or phrase to explain, you should provide a clear, concise, and accurate explanation in English.
If you are asked to do anything else, you should reply with "I do not understand the request."
You should format your response in a way that is suitable for being sent as a Discord message.
You should use proper spelling, punctuation, and grammar in your responses.
YOUR RESPONSE MUST BE IN ENGLISH.
YOUR RESPONSE SHOULD BE NO LONGER THAN 1700 CHARACTERS. If your response is longer, IT WILL BE CUT OFF.`
        : `Du er en AI-språkmodell som er trent for å hjelpe språklærende med norsk.
Du vil få en tekst. Den vil enten være:
- Et spørsmål, som du skal svare på.
- Et norsk ord eller uttrykk, som du skal forklare på norsk og bare på norsk.
Du har muligheten til å slå opp informasjon fra de offisielle norske ordbøkene: Bokmålsordboka og Nynorskordboka.
For å slå opp et ord eller uttrykk, bør du sende en melding som bare inneholder !lookup etterfulgt av ordet eller uttrykket du vil slå opp.
For eksempel, hvis du vil slå opp ordet "hund", bør du sende meldingen !lookup hund.
Du kan bare slå opp ett ord eller uttrykk om gangen, og du bør ikke inkludere annen tekst i meldingen.
Hvis du får et spørsmål, bør du gi et klart, kortfattet og nøyaktig svar.
Hvis du får et ord eller uttrykk å forklare, bør du gi en klar, kortfattet og nøyaktig forklaring på norsk.
Hvis du blir bedt om å gjøre noe annet, bør du svare med "Jeg forstår ikke forespørselen."
Du bør formatere svaret ditt på en måte som er egnet for å sendes som en Discord-melding.
Du bør bruke riktig staving, tegnsetting og grammatikk i svarene dine.
SVARET DITT MÅ VÆRE PÅ NORSK.
SVARET DITT MÅ IKKE VÆRE LENGRE ENN 1700 TEGN. Hvis svaret ditt er lengre, VIL DET BLI KLIPT.`;

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `${instructions}${context ? `\n${context}\n` : ''}`,
      },
      {
        role: 'user',
        content,
      },
    ];

    const continueChat =
      async (): Promise<Stream<ChatCompletionChunk> | null> => {
        try {
          const response = await client.chat.completions.create({
            model: 'gpt-4-0125-preview',
            n: 1,
            messages,
            stream: true,
          });

          // Watch for responses that begin with !lookup.

          const [returnStream, internalStream] = response.tee();

          let text = '';

          for await (const chunk of internalStream) {
            text += chunk.choices[0].delta.content ?? '';

            if (text.length < 8) {
              continue;
            }

            if (text.slice(0, 8) !== '!lookup ') {
              return returnStream;
            }
          }

          const word = text.slice(8).trim();

          let supplemental = 'No definition found.';

          if (word) {
            const definition = await this.ordbokApi.definitions(word, [
              Dictionary.Bokmaalsordboka,
              Dictionary.Nynorskordboka,
            ]);

            if (definition) {
              supplemental = JSON.stringify(definition, null, 2);
            }
          }

          messages.push({
            role: 'assistant',
            content: text,
          });

          messages.push({
            role: 'system',
            content: supplemental,
          });

          return continueChat();
        } catch (error) {
          this.#logger.error('Failed to continue chat', error);
          throw error;
        }
      };

    return continueChat();
  }
}
