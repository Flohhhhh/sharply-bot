import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  type MessageContextMenuCommandInteraction
} from 'discord.js';
import type { Command } from '@/types';
import { fetchMessageSearch } from '@/utils/sharply-api';

export const command: Command<MessageContextMenuCommandInteraction> = {
  data: new ContextMenuCommandBuilder()
    .setName('Search Gear')
    .setType(ApplicationCommandType.Message),
  docs: {
    category: 'Search',
    examples: ['Right-click a message → Apps → Search Gear']
  },
  execute: async (interaction) => {
    const message = interaction.targetMessage.content?.trim();

    if (!message) {
      await interaction.reply({
        content: 'Could not read message content.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await fetchMessageSearch(message);
    if (!result.ok) {
      await interaction.editReply(
        result.code === 'NO_CANDIDATES'
          ? 'No gear-like text found in that message.'
          : 'No matching gear found.'
      );
      return;
    }

    await interaction.editReply(
      `Found: **${result.item.name}**${result.item.brandName ? ` (${result.item.brandName})` : ''}\n${result.item.url}`
    );
  }
};
