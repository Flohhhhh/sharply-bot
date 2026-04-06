import type {
  ChatInputCommandInteraction,
  ClientEvents,
  Collection,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder
} from 'discord.js';

export type SupportedCommandInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction;

export type CommandData =
  | Pick<SlashCommandBuilder, 'name' | 'toJSON'>
  | Pick<ContextMenuCommandBuilder, 'name' | 'toJSON'>;

export interface CommandDocsMetadata {
  category?: string;
  examples?: string[];
  notes?: string;
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, Command>;
  }
}

/**
 * Slash command definition
 * @param data Slash command data
 * @param execute Slash command handler function
 */
export interface Command<T extends SupportedCommandInteraction = SupportedCommandInteraction> {
  data: CommandData;
  execute: (interaction: T) => Promise<void>;
  docs?: CommandDocsMetadata;
}

/**
 * Event handler definition
 * @param name Event name
 * @param runOnce Whether the event should run only once
 * @param execute Event handler function
 */
export interface Event<T extends keyof ClientEvents> {
  name: keyof ClientEvents;
  runOnce?: boolean;
  execute: (...args: ClientEvents[T]) => Promise<void>;
}
