import { createRequire } from 'node:module';
import pino from 'pino';
import { env } from '@/env';

const require = createRequire(import.meta.url);

function prettyTransportOptions():
  | { transport: { target: string; options: Record<string, unknown> } }
  | Record<string, never> {
  if (process.env.NODE_ENV === 'production') {
    return {};
  }
  try {
    require.resolve('pino-pretty');
  } catch {
    return {};
  }
  return {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname,module'
      }
    }
  };
}

export const logger = pino({
  level: env.LOG_LEVEL,
  ...prettyTransportOptions()
});
