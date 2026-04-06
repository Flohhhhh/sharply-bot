import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const emptyToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

export const env = createEnv({
  runtimeEnv: process.env,
  server: {
    DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
    DISCORD_APPLICATION_ID: z.string().min(1, 'DISCORD_APPLICATION_ID is required'),
    DISCORD_GUILD_ID: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
    WEEKLY_DIGEST_DISCORD_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    WEEKLY_DIGEST_GITHUB_REPO: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[\w.-]+\/[\w.-]+$/, 'Expected owner/repo')
        .optional()
    ),
    WEEKLY_DIGEST_CRON: z.preprocess(emptyToUndefined, z.string().min(1).default('0 9 * * 1')),
    WEEKLY_DIGEST_WINDOW_DAYS: z.preprocess(
      (val) => emptyToUndefined(val) ?? 7,
      z.coerce.number().int().min(1).max(90).default(7)
    ),
    GITHUB_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional())
  }
});
