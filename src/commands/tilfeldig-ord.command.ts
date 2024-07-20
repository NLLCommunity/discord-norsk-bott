import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { SlashCommandPipe } from '@discord-nestjs/common';
import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  OrdbokApiProvider,
  FormatterProvider,
  RateLimiterProvider,
  ShowEveryoneProvider,
  OpenAiProvider,
} from '../providers/index.js';
import { DictParam, ShowEveryoneParam } from '../utils/index.js';
import { DisplayLanguage } from '../types/index.js';
import { Dictionary } from '../gql/graphql.js';

export class TilfeldigOrdCommandParams {
  @DictParam({ required: true })
  dictionary: Dictionary;

  @ShowEveryoneParam()
  sendToEveryone?: boolean;
}

/**
 * A command for getting a random word from the dictionary.
 */
@Injectable()
@Command({
  name: 'tilfeldigord',
  description:
    'Få eit tilfeldig ord frå ordboka / Get a random word from the dictionary',
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class TilfeldigOrdCommand {
  constructor(
    private readonly ordbokApi: OrdbokApiProvider,
    private readonly formatter: FormatterProvider,
    private readonly rateLimiter: RateLimiterProvider,
    private readonly showEveryone: ShowEveryoneProvider,
    private readonly openai: OpenAiProvider,
  ) {}

  #logger = new Logger(TilfeldigOrdCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe)
    { dictionary, sendToEveryone }: TilfeldigOrdCommandParams,
  ): Promise<void> {
    this.#logger.log(
      `Søkjer etter tilfeldig ord i ${this.formatter.formatDictionary(dictionary)}`,
    );

    if (!this.openai.isAvailable) {
      await interaction.reply({
        content: 'Denne funksjonen er ikkje konfigurert og kan ikkje brukast.',
        ephemeral: true,
      });

      return;
    }

    if (
      sendToEveryone &&
      this.rateLimiter.isRateLimited(TilfeldigOrdCommand.name, interaction)
    ) {
      return;
    }

    await interaction.deferReply({
      ephemeral: !sendToEveryone,
    });

    try {
      let attempts = 0;

      while (attempts < 3) {
        const response = await this.ordbokApi.randomDefinition(dictionary);

        if (!response) {
          await interaction.editReply(
            `Kunne ikkje henta eit tilfeldig ord frå ${this.formatter.formatDictionary(
              dictionary,
            )}`,
          );
          return;
        }

        const embed = this.formatter.embedForArticle(response);

        const isSafe = await this.openai.isSafeForWork(
          `${embed.data.title}\n${embed.data.description}`,
        );

        if (!isSafe) {
          attempts++;
          continue;
        }

        await interaction.editReply({
          embeds: [embed],
          components:
            sendToEveryone ||
            !interaction.channel ||
            interaction.channel.isDMBased()
              ? []
              : [this.showEveryone.getActionRow(DisplayLanguage.Norwegian)],
        });

        return;
      }

      throw new Error('Innhald henta frå ordbok klassifisert som støytande');
    } catch (err) {
      this.#logger.error('Feil under ordboksøk:', err);
      interaction.editReply('Det skjedde ein feil under ordboksøket');
    }
  }
}
