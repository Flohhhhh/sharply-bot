import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from 'discord.js';
import type { Command } from '@/types';
import { formatUsdPrice } from '@/utils/formatting';
import { fetchGearPriceSummary, searchGear } from '@/utils/sharply-api';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('gear')
    .setDescription('Search Sharply gear data and pricing.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('search')
        .setDescription('Search for gear')
        .addStringOption((option) =>
          option.setName('query').setDescription('Gear search text').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('price')
        .setDescription('Show stored prices for a gear item')
        .addStringOption((option) =>
          option.setName('query').setDescription('Gear search text').setRequired(true)
        )
    ),
  docs: {
    category: 'Search',
    examples: ['/gear search query:Sony A7 IV', '/gear price query:Canon EOS R5']
  },
  execute: async (interaction) => {
    const subcommand = interaction.options.getSubcommand();
    const query = interaction.options.getString('query', true).trim();

    if (subcommand === 'price') {
      await interaction.deferReply();

      const result = await fetchGearPriceSummary(query);
      if (!result) {
        await interaction.editReply(`No gear found for "${query}".`);
        return;
      }

      const lines = [
        `Current MSRP: ${formatUsdPrice(result.prices.msrpNowUsdCents)}`,
        `MSRP at launch: ${formatUsdPrice(result.prices.msrpAtLaunchUsdCents)}`,
        `Max MPB observed: ${formatUsdPrice(result.prices.mpbMaxPriceUsdCents)}`
      ];

      await interaction.editReply(
        `Prices for ${result.item.name}${result.item.brandName ? ` (${result.item.brandName})` : ''}\n${lines.join('\n')}\n${result.item.url}`
      );
      return;
    }

    await interaction.deferReply();

    const item = await searchGear(query);
    if (!item) {
      await interaction.editReply(`No gear found for "${query}". Try a different search term.`);
      return;
    }

    await interaction.editReply(
      `**${item.name}**${item.brandName ? ` by ${item.brandName}` : ''}\n${item.url}`
    );
  }
};
