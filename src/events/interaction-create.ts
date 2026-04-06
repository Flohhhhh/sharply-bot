import {
  Events,
  MessageFlags,
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction
} from 'discord.js';
import type { Event } from '@/types';
import { logger } from '@/utils/logger';

const log = logger.child({ name: 'events/interaction-create' });

function formatCommandLabel(
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction
) {
  if (interaction.isChatInputCommand()) {
    const subcommand = interaction.options.getSubcommand(false);
    return subcommand ? `/${interaction.commandName} ${subcommand}` : `/${interaction.commandName}`;
  }

  return interaction.commandName;
}

export const event: Event<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  execute: async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) {
      return;
    }

    const commandLabel = formatCommandLabel(interaction);
    const startedAt = Date.now();

    log.info(`${commandLabel} used by user ${interaction.user.id}`);

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      log.warn(`Command not found: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      log.debug(
        {
          command: commandLabel,
          userId: interaction.user.id,
          durationMs: Date.now() - startedAt
        },
        'Command succeeded'
      );
    } catch (error) {
      log.debug(
        {
          err: error,
          command: commandLabel,
          userId: interaction.user.id,
          durationMs: Date.now() - startedAt
        },
        'Command failed'
      );

      const errorMessage = 'An error occurred while executing this command.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
