import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '@/types';
import { fetchTrending } from '@/utils/sharply-api';

function suppressDiscordEmbed(url: string): string {
  const trimmed = url.trim();

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed;
  }

  return `<${trimmed}>`;
}

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('trending')
    .setDescription(
      'Show the top 10 trending gear items from the last 7 or 30 days. Defaults to 7 days.'
    )
    .addStringOption((option) =>
      option
        .setName('window')
        .setDescription('Time window (7d or 30d)')
        .addChoices({ name: '7d', value: '7d' }, { name: '30d', value: '30d' })
    ),
  docs: {
    category: 'Lists',
    examples: ['/trending', '/trending window:30d']
  },
  execute: async (interaction) => {
    const window = interaction.options.getString('window') === '30d' ? '30d' : '7d';

    await interaction.deferReply();

    const result = await fetchTrending(window);
    if (result.items.length === 0) {
      await interaction.editReply('No trending items found.');
      return;
    }

    const lines = result.items.map((item, index) => {
      const displayName =
        item.brandName && !item.name.toLowerCase().startsWith(item.brandName.toLowerCase())
          ? `${item.brandName} ${item.name}`
          : item.name;
      return `${index + 1}. ${displayName} — ${suppressDiscordEmbed(item.url)}`;
    });

    await interaction.editReply(`Top trending (${result.window}):\n${lines.join('\n')}`);
  }
};
