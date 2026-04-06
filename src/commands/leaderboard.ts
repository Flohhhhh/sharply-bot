import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '@/types';
import { fetchLeaderboard } from '@/utils/sharply-api';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top contributors to gear specs.'),
  docs: {
    category: 'Community',
    examples: ['/leaderboard']
  },
  execute: async (interaction) => {
    await interaction.deferReply();

    const rows = await fetchLeaderboard();
    if (rows.length === 0) {
      await interaction.editReply('No contributions yet.');
      return;
    }

    const lines = rows.map(
      (row, index) =>
        `${index + 1}. ${row.name} — ${row.score} (edits ${row.edits}, reviews ${row.reviews})`
    );

    await interaction.editReply(`Top contributors:\n${lines.join('\n')}`);
  }
};
