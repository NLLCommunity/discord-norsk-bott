import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from 'discord.js';

/**
 * Provides a way to paginate embeds.
 */
@Injectable()
export class PaginationProvider {
  /**
   * Paginates the given embeds. Does this by creating a pagination embed that
   * can be interacted with to change the current page.
   * @param interaction The interaction to paginate for.
   * @param embeds The embeds to paginate.
   * @param timeout The time in milliseconds before the data is considered
   * expired. In other words, how long to keep the embeds in memory and
   * interactable. Defaults to 2 minutes.
   * @returns The message with the pagination embed.
   */
  async paginate(
    interaction: ChatInputCommandInteraction,
    embeds: EmbedBuilder[],
    timeout = 2 * 60 * 1000,
  ) {
    if (!embeds.length) {
      throw new Error('Pages must be defined and contain at least one page.');
    }

    if (embeds.length === 1) {
      return interaction.editReply({ embeds: [embeds[0]] });
    }

    // Initialize pagination controls
    const controls = [
      { id: 'prev', label: 'Forrige', style: ButtonStyle.Secondary },
      { id: 'next', label: 'Neste', style: ButtonStyle.Primary },
    ].map((control) =>
      new ButtonBuilder()
        .setCustomId(control.id)
        .setLabel(control.label)
        .setStyle(control.style),
    );

    let currentPageIndex = 0;

    // Create a row of buttons for pagination
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(controls);

    // Send the initial page
    const curPage = await interaction.editReply({
      embeds: [
        embeds[currentPageIndex].setFooter({
          text: `Resultat ${currentPageIndex + 1} / ${embeds.length}`,
        }),
      ],
      components: [row],
    });

    const collector = curPage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: timeout,
    });

    collector.on('collect', async (collectorInteraction) => {
      // Update page index based on which button was clicked
      currentPageIndex =
        collectorInteraction.customId === 'prev'
          ? currentPageIndex > 0
            ? currentPageIndex - 1
            : embeds.length - 1
          : (currentPageIndex + 1) % embeds.length;

      // Update the message with the new page
      await collectorInteraction.update({
        embeds: [
          embeds[currentPageIndex].setFooter({
            text: `Resultat ${currentPageIndex + 1} / ${embeds.length}`,
          }),
        ],
        components: [row],
      });
    });

    collector.on('end', () => {
      // remove buttons and add a message to the embed letting the user know that
      // they'll have to send the command again to see other pages of results
      curPage.edit({
        components: [],
        embeds: [
          embeds[currentPageIndex].setFooter({
            text: `Resultat ${currentPageIndex + 1} / ${embeds.length}
Denne meldinga er no utdatert. Send kommandoen på nytt for å sjå andre resultat.`,
          }),
        ],
      });
    });

    return curPage;
  }
}
