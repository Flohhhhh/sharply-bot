import { Events, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { env } from '@/env';
import { startWeeklyGithubDigest } from '@/scheduled/weekly-github-digest';
import type { Event } from '@/types';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'events/ready' });

export const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  runOnce: true,
  execute: async (client) => {
    log.info(`Bot ready! Logged in as ${client.user?.tag}`);
    const connectedApplicationId = client.application?.id;

    if (connectedApplicationId && connectedApplicationId !== env.DISCORD_APPLICATION_ID) {
      log.error(
        {
          configuredApplicationId: env.DISCORD_APPLICATION_ID,
          connectedApplicationId,
          botUserId: client.user?.id
        },
        'Configured application ID does not match the logged-in bot'
      );
    } else {
      log.info(
        {
          applicationId: connectedApplicationId ?? env.DISCORD_APPLICATION_ID
        },
        'Discord application verified'
      );
    }

    const inviteLink = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [PermissionFlagsBits.Administrator]
    });
    if (process.env.NODE_ENV !== 'production') {
      log.info({ inviteLink }, 'Invite Link (Dev Only):');
    }

    startWeeklyGithubDigest();
  }
};
