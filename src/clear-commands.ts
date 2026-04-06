import { REST, Routes } from 'discord.js';
import { env } from '@/env';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'clear-commands' });

const main = async () => {
  const isGlobal = process.argv.includes('--global');
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN);

  if (isGlobal) {
    await rest.put(Routes.applicationCommands(env.DISCORD_APPLICATION_ID), {
      body: []
    });
    log.info('Cleared global application commands');
    return;
  }

  if (!env.DISCORD_GUILD_ID) {
    throw new Error(
      'DISCORD_GUILD_ID is required for guild command clearing. Use --global to clear global commands.'
    );
  }

  await rest.put(
    Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, env.DISCORD_GUILD_ID),
    {
      body: []
    }
  );
  log.info({ guildId: env.DISCORD_GUILD_ID }, 'Cleared guild application commands');
};

main().catch((error) => {
  log.error({ err: error }, 'Failed to clear commands');
  process.exitCode = 1;
});
