import { Injectable, Logger } from '@nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import {
  EmbedBuilder,
  MessageContextMenuCommandInteraction,
  ApplicationCommandType,
  PermissionFlagsBits,
} from 'discord.js';
import {
  ApertiumLanguage,
  ApertiumProvider,
  SanitizationProvider,
  ShowEveryoneProvider,
  getEnumKeyByValue,
} from '../providers/index.js';

/**
 * Detects the language of a message and responds with the most likely
 * languages.
 */
@Injectable()
@Command({
  name: 'Detect Language',
  type: ApplicationCommandType.Message,
  defaultMemberPermissions: PermissionFlagsBits.SendMessages,
})
export class DetectLanguageCommand {
  constructor(
    private readonly apertium: ApertiumProvider,
    private readonly showEveryone: ShowEveryoneProvider,
    private readonly sanitizer: SanitizationProvider,
  ) {}

  #logger = new Logger(DetectLanguageCommand.name);

  /**
   * Handles the command.
   * @param interaction The interaction event.
   * @param params The command parameters.
   */
  @Handler()
  async handle(
    @InteractionEvent() interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    const text = interaction.targetMessage.content;

    if (!text) {
      await interaction.reply({
        content: 'No text to detect.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const candidates = await this.apertium.detectLanguages(text);

      const excerpt = this.sanitizer.sanitize(
        text.length > 100 ? `${text.slice(0, 100)}…` : text,
      );

      // Send the top 3 detected languages. Skip any with a low confidence.

      const topLanguages = candidates
        .filter((candidate) => candidate.confidence > 0.5)
        .slice(0, 3)
        .map((candidate) => {
          const language = getEnumKeyByValue(
            ApertiumLanguage,
            candidate.language,
          );
          return { language, confidence: candidate.confidence };
        });

      const firstPlace = topLanguages.shift();

      let description = `@${interaction.targetMessage.author.username} said:\n> ${excerpt}\n\n`;

      if (!firstPlace) {
        description +=
          "I couldn't detect the language of that message. It may be too short or be in a language I don't support.";
      } else {
        description += `I am **${(firstPlace.confidence * 100).toFixed(2)}% confident** that the message is in **${firstPlace.language}**.`;

        if (topLanguages.length > 0) {
          description += `\n\nOther likely languages include:\n${topLanguages
            .map(
              (language) =>
                `- ${language.language} (${(language.confidence * 100).toFixed(2)}%)`,
            )
            .join('\n')}`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('Language Detection')
        .setDescription(description)
        .setFooter({
          text: '⚠️ I am not always accurate. Dialects or slang may affect the result. Ask a human for confirmation.',
        });

      await interaction.editReply({
        embeds: [embed],
        components: [this.showEveryone.getActionRow()],
      });
    } catch (error) {
      this.#logger.error('Error detecting language', error);

      await interaction.editReply({
        content: 'An error occurred while detecting the language.',
      });
    }
  }
}
