import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

/**
 * Creates a pagination embed for navigating through a list of MessageEmbeds.
 *
 * @param {import('discord.js').Interaction} interaction The Discord interaction
 * that triggered the pagination.
 * @param {EmbedBuilder[]} pages An array of MessageEmbeds to be paginated
 * through.
 * @param {number} [timeout] The time in milliseconds before the data is
 * considered to be stale and the collector is automatically ended. Defaults to
 * 2 minutes.
 * @returns The message with the pagination embed.
 */
export async function paginate(interaction, pages, timeout = 2 * 60 * 1000) {
  if (!pages.length) {
    throw new Error('Pages must be defined and contain at least one page.');
  }

  if (pages.length === 1) {
    return interaction.editReply({ embeds: [pages[0]] });
  }

  // Initialize pagination controls
  const controls = [
    { id: 'prev', label: 'Forrige', style: ButtonStyle.Secondary },
    { id: 'next', label: 'Neste', style: ButtonStyle.Primary },
  ].map((control) =>
    new ButtonBuilder()
      .setCustomId(control.id)
      .setLabel(control.label)
      .setStyle(control.style)
  );

  let currentPageIndex = 0;

  // Create a row of buttons for pagination
  const row = new ActionRowBuilder().addComponents(controls);

  // Send the initial page
  const curPage = await interaction.editReply({
    embeds: [
      pages[currentPageIndex].setFooter({
        text: `Resultat ${currentPageIndex + 1} / ${pages.length}`,
      }),
    ],
    components: [row],
    fetchReply: true,
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
          : pages.length - 1
        : (currentPageIndex + 1) % pages.length;

    // Update the message with the new page
    await collectorInteraction.update({
      embeds: [
        pages[currentPageIndex].setFooter({
          text: `Resultat ${currentPageIndex + 1} / ${pages.length}`,
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
        pages[currentPageIndex].setFooter({
          text: `Resultat ${currentPageIndex + 1} / ${pages.length}
Denne meldinga er no utdatert. Send kommandoen på nytt for å sjå andre resultat.`,
        }),
      ],
    });
  });

  return curPage;
}
