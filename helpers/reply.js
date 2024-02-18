/**
 * Reply to an interaction with a message, sending it in parts if it exceeds the
 * character limit.
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function reply(interaction, message) {
  if (message.length <= 2000) {
    return interaction.editReply(message);
  }

  const messages = [];

  while (message.length > 2000) {
    const index = message.lastIndexOf('\n', 2000);
    messages.push(message.slice(0, index));
    message = message.slice(index + 1);
  }

  messages.push(message);

  for (const msg of messages) {
    await interaction.followUp(msg);
  }
}
