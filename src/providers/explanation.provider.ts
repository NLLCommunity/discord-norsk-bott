import { PassThrough } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/index.js';
import { OpenAiProvider } from './openai.provider.js';
import { OrdbokApiProvider } from './ordbokapi.provider.js';
import { DisplayLanguage, getUiBUrl } from '../types/index.js';
import { Dictionary, WordDefinitionsQuery } from '../gql/graphql.js';
import { RagProvider } from './rag.provider.js';

interface ExplanationContext {
  references: Set<string>;
}

@Injectable()
export class ExplanationProvider {
  readonly #logger = new Logger(ExplanationProvider.name);

  constructor(
    private readonly openAi: OpenAiProvider,
    private readonly ordbokApi: OrdbokApiProvider,
    private readonly ragProvider: RagProvider,
  ) {}

  get isAvailable(): boolean {
    return this.openAi.isAvailable;
  }

  /**
   * Format articles from the dictionary for parsing by an LLM.
   * @param articles The articles to format.
   * @returns Markdown containing definitions from all the articles.
   */
  #formatDefinitionMarkdown(
    articles: NonNullable<
      NonNullable<WordDefinitionsQuery['word']>['articles']
    > | null,
  ): string {
    if (!articles?.length) {
      return 'No definition available.';
    }

    let markdown = '# Dictionary Definition\n\n';

    articles.forEach((article) => {
      markdown += `## Article (ID: ${article.id}) - ${article.dictionary} - ${
        article.lemmas?.map((lemmaObj) => lemmaObj.lemma).join(', ') ||
        'No lemmas'
      }\n\n`;
      markdown += `**Word Class:** ${article.wordClass}\n\n`;
      if (article.gender) {
        markdown += `**Gender:** ${article.gender}\n\n`;
      }

      if (article.lemmas && article.lemmas.length > 0) {
        markdown += '### Lemmas\n';
        article.lemmas.forEach((lemmaObj) => {
          markdown += `- **Lemma:** ${lemmaObj.lemma}\n`;
          if (lemmaObj.paradigms && lemmaObj.paradigms.length > 0) {
            lemmaObj.paradigms.forEach((paradigm, paradigmIndex) => {
              markdown += `  - **Paradigm ${paradigmIndex + 1}:**\n`;
              if (paradigm.inflections && paradigm.inflections.length > 0) {
                paradigm.inflections.forEach((inflection) => {
                  markdown += `    - \`${inflection.wordForm}\` (*${inflection.tags.join(', ')}*)\n`;
                });
              }
            });
          }
        });
        markdown += '\n';
      }

      if (article.definitions && article.definitions.length > 0) {
        markdown += '### Definitions\n';
        article.definitions.forEach((def, defIndex) => {
          markdown += `- **Definition ${defIndex + 1}:**\n`;
          if (def.content && def.content.length > 0) {
            def.content.forEach((contentObj) => {
              markdown += `  - ${contentObj.textContent}\n`;
            });
          }
          if (def.examples && def.examples.length > 0) {
            markdown += '  - **Examples:**\n';
            def.examples.forEach((example) => {
              markdown += `    - ${example.textContent}\n`;
            });
          }
        });
        markdown += '\n';
      }
    });

    return markdown;
  }

  /**
   * Accumulates tool call deltas from the given async stream until a chunk yields no tool calls.
   * Returns an array of fully constructed tool calls.
   *
   * @param stream - An async iterable of response chunks from the OpenAI API.
   * @returns A promise that resolves with an array of accumulated tool calls.
   */
  async #accumulateToolCalls(
    stream: AsyncIterable<any>,
  ): Promise<ChatCompletionMessageFunctionToolCall[]> {
    this.#logger.debug('Entering #accumulateToolCalls');
    const finalToolCalls: Record<number, any> = {};

    for await (const chunk of stream) {
      const toolCalls = chunk.choices[0].delta.tool_calls || [];
      // If no tool calls are present in this chunk, assume accumulation is complete.
      if (toolCalls.length === 0) break;

      for (const toolCall of toolCalls) {
        const index = toolCall.index;
        // Only handle function tool calls we declared.
        if (toolCall.type !== 'function') continue;
        // Initialize if first delta for this tool call index.
        if (!finalToolCalls[index]) {
          // Ensure arguments start as an empty string if not provided.
          finalToolCalls[index] = {
            ...toolCall,
            function: {
              ...toolCall.function,
              arguments: toolCall.function.arguments || '',
            },
          };
        } else {
          // Append additional fragments.
          finalToolCalls[index].function.arguments +=
            toolCall.function.arguments;
        }
      }
    }

    this.#logger.verbose('Final accumulated tool calls:', finalToolCalls);
    return Object.values(finalToolCalls);
  }

  /**
   * Process a tool call by routing to the corresponding method.
   * Expects tool calls from functions exposed as tools (lookup and searchInternet).
   * @param toolCall The tool call to process.
   * @param currentMessages The conversation messages.
   * @param language The display language.
   * @param context The explanation context.
   */
  async #processToolCall(
    toolCall: ChatCompletionMessageFunctionToolCall,
    currentMessages: ChatCompletionMessageParam[],
    customStream: PassThrough,
    language: DisplayLanguage,
    context: ExplanationContext,
  ): Promise<void> {
    this.#logger.debug(
      `Processing tool call ${toolCall.id} with name ${toolCall.function.name}`,
    );
    try {
      const parsedArgs = JSON.parse(toolCall.function.arguments);
      let supplemental = '';
      let statusUpdate = '';
      if (toolCall.function.name === 'lookup') {
        // Update status before the lookup.
        statusUpdate =
          language === DisplayLanguage.English
            ? 'Looking up the word in the Norwegian dictionaries…'
            : 'Slår opp ordet i de norske ordbøkene…';
        customStream.write('\r' + statusUpdate);
        supplemental = await this.#performLookup(
          parsedArgs.word,
          language,
          context,
        );
        // Update status after lookup.
        statusUpdate =
          language === DisplayLanguage.English
            ? 'Interpreting data from the Norwegian dictionaries…'
            : 'Tolker data frå dei norske ordbøkene…';
      } else if (toolCall.function.name === 'searchInternet') {
        // Update status before the search.
        statusUpdate =
          language === DisplayLanguage.English
            ? 'Searching the internet for additional context…'
            : 'Søkjer på internett etter ytterlegare kontekst…';
        customStream.write('\r' + statusUpdate);
        supplemental = await this.#performSearch(parsedArgs.query, context);
        // Update status after search.
        statusUpdate =
          language === DisplayLanguage.English
            ? 'Interpreting search results from the internet…'
            : 'Tolkar søkeresultat frå internettet…';
      }
      // Append the tool result to the conversation.
      currentMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: supplemental,
      });
      customStream.write('\r' + statusUpdate);
      this.#logger.verbose(
        `Tool call ${toolCall.id} processed successfully with result:`,
        supplemental,
      );
    } catch (err) {
      this.#logger.warn(
        'Failed to parse fully accumulated tool call arguments',
        err,
      );
    }
  }

  /**
   * Lookup definitions for a given word or phrase using Ordbok API.
   * @param word The word or phrase to look up.
   * @param language The language to use for the response.
   * @param context The explanation context.
   * @returns A markdown string containing definitions.
   */
  async #performLookup(
    word: string,
    language: DisplayLanguage,
    context: ExplanationContext,
  ): Promise<string> {
    this.#logger.debug(`Performing lookup for word: ${word}`);
    const articles = await this.ordbokApi.definitions(word, [
      Dictionary.Bokmaalsordboka,
      Dictionary.Nynorskordboka,
    ]);

    articles.forEach((article) => {
      const url = getUiBUrl(article);
      const wordClassShort = (() => {
        switch (article.wordClass) {
          case 'Substantiv':
            return language === DisplayLanguage.English ? 'noun' : 'subst.';
          case 'Adjektiv':
            return 'adj.';
          case 'Verb':
            return 'verb';
          case 'Adverb':
            return 'adv.';
          case 'Preposisjon':
            return 'prep.';
          case 'Pronomen':
            return 'pron.';
          case 'Konjunksjon':
            return language === DisplayLanguage.English ? 'conj.' : 'konj.';
          case 'Subjunksjon':
            return 'subj.';
          case 'Interjeksjon':
            return 'interj.';
          case 'Determinativ':
            return 'det.';
          case 'Forkorting':
            return language === DisplayLanguage.English ? 'abbr.' : 'fork.';
          case 'Symbol':
            return 'symbol';
          case 'Uttrykk':
            return language === DisplayLanguage.English ? 'expr.' : 'uttrykk';
          default:
            return article.wordClass;
        }
      })();
      const dictShort =
        article.dictionary === Dictionary.Bokmaalsordboka
          ? 'bokmål'
          : 'nynorsk';

      context.references.add(
        `[${article.lemmas
          ?.map((lemma) => lemma.lemma)
          .join(', ')}](<${url}>) (${dictShort}, ${wordClassShort})`,
      );

      this.#logger.verbose(
        `Lookup result for "${word}" from ${article.dictionary}: ${article.definitions
          ?.map((def) => def.content?.map((content) => content.textContent))
          .join(', ')}`,
      );
    });

    const result =
      articles.length > 0
        ? // Randomly sort to avoid bias in the response.
          this.#formatDefinitionMarkdown(
            articles.sort(() => Math.random() - 0.5),
          )
        : 'No definition found.';
    this.#logger.verbose(
      `Lookup result for "${word}": ${result.substring(0, 100)}...`,
    );
    return result;
  }

  /**
   * Search the internet for examples or additional context for a given query.
   * @param query The search query.
   * @param context The explanation context.
   * @returns A string with search results.
   */
  async #performSearch(
    query: string,
    context: ExplanationContext,
  ): Promise<string> {
    try {
      const { summary, url } = await this.ragProvider.retrieveContext(query);

      context.references.add(`<${url}>`);

      return `Context from ${url}:\n\n${summary}`;
    } catch (error) {
      this.#logger.error('Error performing search', error);
      return `No additional information found for "${query}".`;
    }
  }

  /**
   * Returns the list of tools exposed to the LLM.
   */
  #getTools(): ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'lookup',
          description:
            'Lookup definitions for a given Norwegian word or phrase from the official dictionaries',
          parameters: {
            type: 'object',
            properties: {
              word: {
                type: 'string',
                description: 'The word or phrase to look up.',
              },
            },
            required: ['word'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      {
        type: 'function',
        function: {
          name: 'searchInternet',
          description:
            'Search the internet for examples or additional context for a given query',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to look up online.',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    ];
  }

  /**
   * Processes the response stream from the OpenAI API.
   * Recursively continues the conversation when tool calls are encountered.
   * @param currentMessages The current conversation messages.
   * @param customStream The PassThrough stream to output results.
   * @param language The language for the response.
   */
  async #processStream(
    currentMessages: ChatCompletionMessageParam[],
    customStream: PassThrough,
    language: DisplayLanguage,
    context: ExplanationContext = { references: new Set() },
  ): Promise<void> {
    this.#logger.debug(
      `Starting stream processing with ${currentMessages.length} messages`,
    );
    try {
      const client = this.openAi.client!;
      const response = await client.chat.completions.create({
        model: 'o3-mini',
        n: 1,
        messages: currentMessages,
        stream: true,
        reasoning_effort: 'medium',
        tools: this.#getTools(),
        tool_choice: 'auto',
      });

      customStream.on('close', () => {
        response.controller.abort();
      });

      const [responseStream, responseClone] = response.tee();
      let hasSentContent = false;
      for await (const chunk of responseStream) {
        this.#logger.verbose('Processing new stream chunk');
        if (chunk.choices[0].delta.tool_calls) {
          const accumulatedToolCalls =
            await this.#accumulateToolCalls(responseClone);
          currentMessages.push({
            role: 'assistant',
            tool_calls: accumulatedToolCalls,
          });
          for (const toolCall of accumulatedToolCalls) {
            await this.#processToolCall(
              toolCall,
              currentMessages,
              customStream,
              language,
              context,
            );
          }
          return await this.#processStream(
            currentMessages,
            customStream,
            language,
            context,
          );
        } else if (chunk.choices[0].delta.content) {
          if (!hasSentContent) {
            customStream.write('\r');
            hasSentContent = true;
          }
          customStream.write(chunk.choices[0].delta.content);
        }
      }

      this.#logger.verbose('Stream processing complete');

      // Append references to the end of the response.
      if (context.references.size > 0) {
        this.#logger.verbose(
          'Appending references to the response',
          context.references,
        );
        customStream.write(
          `\n\n-# **${
            language === DisplayLanguage.English ? 'References' : 'Referansar'
          }**\n-# ${Array.from(context.references).join(';  ')}`,
        );
      }
      customStream.end();
    } catch (error) {
      this.#logger.error('Failed to process stream', error);
      customStream.end();
    }
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
  ): Promise<PassThrough | null> {
    const { client } = this.openAi;
    if (!client) {
      return null;
    }

    const instructions =
      language === DisplayLanguage.English
        ? `**Role & Task**
You are an AI language model designed to assist language learners with Norwegian. You will be given a piece of text that is either:
- **A question:** Answer it in English.
- **A Norwegian word/phrase:** Explain its meaning in English.

**Core Abilities**
1. **Dictionary Lookup:**
   - Use the official dictionaries (Bokmålsordboka and Nynorskordboka).
   - When you need a definition, call the lookup function with a JSON object:
     \`{"word": "yourWordOrPhrase"}\`.
   - If multiple definitions are returned, present the most relevant and common meaning first, followed by any additional ones.
   - Do not include dictionary links; they will be added automatically.

2. **Internet Search for Questions:**
   - For every question—regardless of complexity—perform an internet search to gather current, helpful context.
   - Call the searchInternet function with a JSON object:
     \`{"query": "your search string"}\`.
   - Use the information to inform your response without quoting verbatim; if nothing relevant is found, rely on your own knowledge.

Remember you can supply multiple of these tasks in a single prompt, and you can mix and match searching the internet and looking up words — this can be a good way to make sure you have all the information you need to answer a question.
For example, if you're asked to explain when is the right time to use a given word, you might want to both search online for the answer and look up the word in the dictionary.

**Formatting & Style Guidelines**
- **Quotation Marks:** Use English curly quotes (‘’ or “”).
- **Markdown Limitations:**
  - **Bold:** **text**
  - **Italic:** *text*
  - **Inline code:** \`code\`
  - **Unordered lists** (single or nested without extra blank lines, use - for bullets)
- **Response Requirements:**
  - Provide a clear, concise explanation easy to understand for language learners.
  - Emphasize the most relevant, common meanings and note any differences between Bokmål and Nynorsk if applicable.
  - Keep your response under 1700 characters.

**Self-Check Before Answering:**
- Is the explanation clear and accurate?
- Am I emphasizing the most relevant definition?
- Have I provided the most common meanings?
- Have I ensured the explanation applies appropriately to both language forms?
- Is my response tailored to language learners?
  - Will they have an easy time understanding it?
  - Are there good examples?
  - Have I avoided jargon or overly complex language?

Answer in English and always use both dictionary lookup and internet search as described.`
        : `**Rolle og oppgave**
Du er en AI-språkmodell designet for å hjelpe språkelever med norsk. Du vil motta en tekst som enten er:
- **Et spørsmål:** Svar på det kun på norsk.
- **Et norsk ord/uttrykk:** Forklar betydningen på norsk.

**Kjernefunksjoner**
1. **Ordboksoppslag:**
   - Bruk de offisielle ordbøkene (Bokmålsordboka og Nynorskordboka).
   - Når du trenger en definisjon, kall funksjonen \`lookup\` med et JSON-objekt:
     \`{"word": "dittOrdEllerUttrykk"}\`.
   - Dersom du mottar flere definisjoner, presenter den mest relevante og vanlige betydningen først, etterfulgt av øvrige definisjoner.
   - Inkludér ikke lenker til ordboksartikler; disse vil bli lagt til automatisk.

2. **Internett-søk for spørsmål:**
   - For hvert spørsmål – uansett kompleksitet – utfør et internett-søk for å hente oppdatert og nyttig kontekst.
   - Kall funksjonen \`searchInternet\` med et JSON-objekt:
     \`{"query": "din søkestreng"}\`.
   - Bruk informasjonen til å informere svaret ditt uten å sitere ordrett; hvis ingen relevant informasjon finnes, bruk din egen kunnskap.

Husk at du kan inkludere flere av disse oppgavene i en enkelt forespørsel, og du kan blande internett-søk og ordboksoppslag – dette kan være en god måte å sikre at du har all informasjonen du trenger for å svare på et spørsmål.
For eksempel, hvis du blir bedt om å forklare når det er riktig å bruke et gitt ord, kan du ønske å både søke på nettet etter svaret og slå opp ordet i ordboka.

**Formatering og stilretningslinjer**
- **Gåseøyne:** Bruk norske gåseøyne «» og krøllparanteser ‘’ for sitater.
- **Markdown-begrensninger:**
  - **Fet:** **tekst**
  - **Kursiv:** *tekst*
  - **Inline-kode:** \`kode\`
  - **Uordnede lister** (enkelt eller med innrykk uten ekstra linjeskift, bruk - for punkter)
- **Svarskrav:**
  - Gi en klar og konsis forklaring som er lett å forstå for språkelever.
  - Fremhev de mest relevante og vanlige betydningene, og nevn eventuelle forskjeller mellom Bokmål og Nynorsk om aktuelt.
  - Hold svaret under 1700 tegn.

**Selvkontroll før svar:**
- Er forklaringen klar og nøyaktig?
- Har jeg fremhevet den mest relevante definisjonen?
- Har jeg gitt de vanligste betydningene?
- Er forklaringen tilpasset begge målformer?
- Er svaret mitt tilpasset språkelever?
  - Vil de forstå det lett?
  - Er det gode eksempler?
  - Har jeg unngått fagspråk eller for komplekst språk?

Svar kun på norsk, og bruk alltid både ordboksoppslag og internett-søk slik det er beskrevet.`;

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'developer',
        content: `${instructions}${context ? `\n${context}\n` : ''}`,
      },
      {
        role: 'user',
        content,
      },
    ];

    // Create a custom stream using native Node's PassThrough
    const customStream = new PassThrough();

    // Begin processing the conversation stream
    this.#processStream(messages, customStream, language).catch((error) => {
      this.#logger.error('Failed to start processing stream', error);
      customStream.end();
    });

    customStream.write(
      language === DisplayLanguage.English
        ? 'Asking ChatGPT your question…'
        : 'Stiller ChatGPT spørsmålet ditt…',
    );

    this.#logger.debug(`Initial question asked in ${language}: ${content}`);

    return customStream;
  }
}
