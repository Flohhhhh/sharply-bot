import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '@/types';
import { env } from '@/env';
import { runWeeklyGithubDigest } from '@/scheduled/weekly-github-digest';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder()
    .setName('digest')
    .setDescription('Manually trigger the weekly GitHub change digest.'),
  docs: {
    category: 'Utility',
    examples: ['/digest']
  },
  execute: async (interaction) => {
    if (!env.WEEKLY_DIGEST_DISCORD_WEBHOOK_URL || !env.WEEKLY_DIGEST_GITHUB_REPO) {
      await interaction.reply({
        content:
          '⚠️ Digest is not configured. Set `WEEKLY_DIGEST_DISCORD_WEBHOOK_URL` and `WEEKLY_DIGEST_GITHUB_REPO` to enable it.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await runWeeklyGithubDigest({ reason: 'manual' });
      await interaction.editReply('✅ Digest posted successfully.');
    } catch {
      await interaction.editReply('❌ Digest run failed. Check the logs for details.');
    }
  }
};
