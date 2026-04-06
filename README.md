# Sharply Bot

![intro](docs/images/intro.png)

[![Node.js](https://img.shields.io/badge/node.js-20+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/ESLint-4B32C3?logo=eslint&logoColor=white)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=black)](https://prettier.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A persistent Discord bot for Sharply built with Node.js, TypeScript, and `discord.js`.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/discord-bot-template?referralCode=DIAbPh&utm_medium=integration&utm_source=template&utm_campaign=generic)

## Features

- Runs on Node.js 20+ with [tsx](https://github.com/privatenumber/tsx) for TypeScript execution
- Full type safety with Zod environment variable validation
- Dynamic command/event loading
- Slash commands and a message context command backed by Sharply internal API endpoints
- Docker/Railway deployment ready

## Repo Boundary

This repository is intentionally the Discord-facing layer, not the full Sharply product.

- `sharply-bot` owns Discord commands, command deployment, interaction handling, reply formatting, and runtime concerns.
- `sharply` owns product logic, database access, canonical Sharply URLs, and the protected internal API consumed by this bot.

The integration boundary is authenticated HTTP. The bot should call Sharply through `src/utils/sharply-api.ts`, not import or recreate frontend/app logic locally.

For the full contract, see [docs/frontend-bot-contract.md](docs/frontend-bot-contract.md).

## Quick Start

### Installation

```bash
npm install
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_APPLICATION_ID=your_application_id_here
DISCORD_GUILD_ID=your_guild_id_here  # optional
SHARPLY_API_BASE_URL=https://your-sharply-app.example.com
SHARPLY_INTERNAL_API_TOKEN=shared_internal_token
```

### Deploy Commands

```bash
npm run deploy-commands              # Guild deploy (development)
npm run deploy-commands -- --global  # Global deploy (production, take more time to propagate)
npm run clear-commands               # Clear guild commands
npm run clear-commands:global        # Clear global commands
```

### Run

```bash
npm run start
```

## Project Structure

```
src/
├── index.ts          # Entry point
├── client.ts         # Discord client setup
├── env.ts            # Environment validation
├── types.d.ts        # Type definitions
├── deploy.ts         # Command deployment script
├── commands/         # Slash + context menu commands
│   ├── ping.ts
│   ├── gear.ts
│   ├── compare.ts
│   ├── leaderboard.ts
│   ├── totals.ts
│   ├── trending.ts
│   └── message-search-gear.ts
├── events/           # Event handlers
│   ├── ready.ts
│   └── interaction-create.ts
└── utils/
    ├── core.ts       # Command/event loader
    └── logger.ts     # Logger configuration
```

## Adding Commands

Create a new file in `src/commands/`:

```typescript
import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from '@/types';

export const command: Command<ChatInputCommandInteraction> = {
  data: new SlashCommandBuilder().setName('hello').setDescription('Says hello!'),
  execute: async (interaction) => {
    await interaction.reply('Hello, World!');
  }
};
```

## Adding Events

Create a new file in `src/events/`:

```typescript
import { Events } from 'discord.js';
import type { Event } from '@/types';

export const event: Event<Events.GuildMemberAdd> = {
  name: Events.GuildMemberAdd,
  execute: async (member) => {
    console.log(`${member.user.tag} joined the server!`);
  }
};
```

## Deployment

### Railway

To deploy on Railway, simply connect the repository and set environment variables.

1. Create a project on [Railway](https://railway.app/)
2. Connect your GitHub repository
3. Set environment variables:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_APPLICATION_ID`
4. Automatic deployment

Or deploy via CLI:

```bash
railway up
```

### Docker

```bash
docker build -t discord-bot .
docker run -d --env-file .env discord-bot
```

## Scripts

| Command                         | Description                            |
| ------------------------------- | -------------------------------------- |
| `npm run start`                 | Start the bot                          |
| `npm run deploy-commands`       | Deploy slash and context-menu commands |
| `npm run clear-commands`        | Clear guild commands                   |
| `npm run clear-commands:global` | Clear global commands                  |
| `npm run lint`                  | Run ESLint                             |
| `npm run lint:fix`              | Run ESLint with auto-fix               |
| `npm run fmt`                   | Format with Prettier                   |
| `npm run check`                 | ESLint + Prettier check (no writes)    |
| `npm run typecheck`             | TypeScript type check                  |

## Contributing

Contributions are very welcome!

### Can I Contribute Without The Frontend Repo?

Yes, for a lot of work.

You can usually make meaningful changes in `sharply-bot` alone when the work is about Discord UX or bot runtime behavior:

- command descriptions, options, and examples
- reply copy and message formatting
- ephemeral vs public behavior
- loading, logging, error handling, deployment, and scheduling
- bug fixes in command routing or Discord-specific interaction flow

You will usually need the `sharply` repo as well when the change affects app-owned behavior:

- new product logic or business rules
- gear search, compare, pricing, leaderboard, or trending behavior
- database reads or writes
- new or changed internal API endpoints
- command metadata that also powers the Sharply site docs

The default split is:

1. Add or update the internal endpoint in `sharply` when app logic changes.
2. Update `src/utils/sharply-api.ts` in this repo.
3. Implement the Discord UX in `src/commands/**`.
4. Update mirrored docs/manifest data in `sharply` if command docs changed.

If ownership is unclear, use this rule: Discord behavior belongs here; Sharply data and product logic belong in `sharply`.

### Bug Reports & Feature Requests

Please use [GitHub Issues](https://github.com/caru-ini/discord-bot-template/issues) to report bugs or suggest features.

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run checks:
   ```bash
   npm run check      # lint + format
   npm run typecheck  # type check
   ```
5. Commit with [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add amazing feature"
   ```
6. Push and open a Pull Request

### Development Setup

```bash
npm install
cp .env.example .env
# Edit .env with your bot credentials and a reachable Sharply API
npm run start
```

For bot-only work, you do not need a local checkout of `sharply` as long as you have access to a compatible Sharply environment and internal token.

If your change updates the bot/frontend contract, read [docs/frontend-bot-contract.md](docs/frontend-bot-contract.md) before opening the PR.

## License

[MIT](LICENSE)
