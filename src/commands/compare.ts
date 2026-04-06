import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '@/types';
import { fetchCompareSummary } from '@/utils/sharply-api';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Fetch a comparison between two provided gear items.')
    .addStringOption((option) =>
      option.setName('one').setDescription('First gear (name or slug)').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('two').setDescription('Second gear (name or slug)').setRequired(true)
    ),
  docs: {
    category: 'Search',
    examples: ['/compare one:Sony A7 IV two:Canon EOS R5']
  },
  execute: async (interaction) => {
    const firstQuery = interaction.options.getString('one', true).trim();
    const secondQuery = interaction.options.getString('two', true).trim();

    await interaction.deferReply();

    const result = await fetchCompareSummary(firstQuery, secondQuery);
    if (!result.first || !result.second || !result.compareUrl) {
      await interaction.editReply('Could not resolve both items. Try more specific queries.');
      return;
    }

    await interaction.editReply(
      `Compare: ${result.first.name} vs ${result.second.name}\n${result.compareUrl}`
    );
  }
};
