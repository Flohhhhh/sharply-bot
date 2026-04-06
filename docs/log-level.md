# Log level (`LOG_LEVEL`)

The bot uses [Pino](https://github.com/pinojs/pino) for structured logging. In normal development it runs with the `pino-pretty` transport so lines are colorized and timestamps are human-readable.

## How it works

`LOG_LEVEL` sets the **minimum** severity that is printed. Anything **at or above** that level is shown; more verbose levels below it are dropped.

| If you set | You will see                      |
| ---------- | --------------------------------- |
| `debug`    | `debug`, `info`, `warn`, `error`  |
| `info`     | `info`, `warn`, `error` (default) |
| `warn`     | `warn`, `error`                   |
| `error`    | `error` only                      |

Configure it in `.env`:

```env
LOG_LEVEL=debug
```

Omit it or leave it empty to use the default (`info`). Valid values are exactly: `debug`, `info`, `warn`, `error` (validated in `src/env.ts`).

## Levels in practice

### `debug`

Use for detailed traces: HTTP payloads, scheduling internals, “step completed” style messages. Most of this code lives behind `logger.child({ name: '…' })` so you can grep by module.

**Example (illustrative `pino-pretty` output):**

```text
[04/05/2026, 10:15:30 AM] DEBUG: Discord webhook: complete
    parts: 2
    totalChars: 1842
```

At default `info`, these lines usually **do not** appear.

### `info`

Normal lifecycle and operational messages: startup, commands/events loaded, bot ready, graceful shutdown, successful deploys, digest runs.

**Example:**

```text
[04/05/2026, 10:15:31 AM] INFO: Loaded 2 command(s).
[04/05/2026, 10:15:32 AM] INFO: Bot ready! Logged in as MyBot#1234
```

### `warn`

Something unexpected but handled: missing command for an interaction, deprecated paths, recoverable oddities.

**Example:**

```text
[04/05/2026, 10:16:00 AM] WARN: Command not found: oldcommand
```

### `error`

Failures that need attention: unhandled rejections (when logged), command execution errors, failed deploys, digest or webhook failures. Often includes an `err` object for the stack/cause.

**Example:**

```text
[04/05/2026, 10:16:05 AM] ERROR: Error executing command: ping
    err: {
      "type": "DiscordAPIError",
      "message": "…"
    }
```

## Tips

- Use **`LOG_LEVEL=debug`** when debugging integrations (webhooks, GitHub, scheduled jobs).
- Use **`LOG_LEVEL=info`** (or unset) in production so logs stay readable and storage-friendly.
- Create a child logger per area: `const log = logger.child({ name: 'commands/ping' })` and pass structured fields as the first argument: `log.info({ userId }, 'handled')`.
