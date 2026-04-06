import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '@/types';
import { fetchTotals } from '@/utils/sharply-api';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('totals')
    .setDescription(
      'Show the total number of gear items in the database and contributions to gear specs all-time.'
    ),
  docs: {
    category: 'Community',
    examples: ['/totals']
  },
  execute: async (interaction) => {
    await interaction.deferReply();

    const totals = await fetchTotals();
    await interaction.editReply(
      `Totals — Gear: ${totals.gearCount.toLocaleString()}, Contributions: ${totals.contributionCount.toLocaleString()}`
    );
  }
};
