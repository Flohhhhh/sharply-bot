---
name: sharply-best-practices
description: Use when building, reviewing, or refactoring Sharply Bot features that integrate with the Sharply frontend/app. Apply this skill for Discord command work, command deployment changes, message context commands, Sharply internal API integrations, mirrored bot-doc updates, or any cross-repo change where ownership between `sharply-bot` and `sharply` must stay clean.
---

# Sharply Best Practices

Use this skill to keep `sharply-bot` aligned with Sharply's app architecture instead of letting the bot become a second source of truth.

## Start With The Contract

Read these files before making structural changes:

- `AGENTS.md`
- `docs/frontend-bot-contract.md`
- `docs/architecture-plan.md`
- `README.md`

Treat the frontend/bot contract as the source of truth for ownership.

## Keep Ownership Clear

`sharply-bot` owns:

- Discord command definitions
- command deployment and clearing
- Discord gateway interaction handling
- reply formatting
- ephemeral vs public Discord behavior
- bot-side logging and runtime concerns

`sharply` owns:

- product logic
- user/account resolution
- gear search, compare, pricing, leaderboard, and trending logic
- database access
- authenticated internal HTTP endpoints
- canonical Sharply URLs

Do not move Sharply logic into the bot just because it is convenient.

## Default Integration Rule

When a new command needs data or behavior from Sharply:

1. Add or extend a protected internal endpoint in `sharply`.
2. Update the bot API client in `src/utils/sharply-api.ts`.
3. Implement the Discord UX in `src/commands/**`.
4. Update docs and the mirrored manifest in `sharply` if command docs changed.

Do not:

- query Sharply's database directly from the bot
- import Sharply server modules into this repo
- reimplement app-side business logic locally

## Command Design Rules

For commands in this repo:

- Keep files small and command-focused.
- Use `interaction.deferReply()` for anything that depends on network or app calls.
- Keep user-facing fallback copy in the bot.
- Keep response formatting in the bot, but keep raw business decisions in Sharply.
- Prefer explicit command option parsing over clever abstractions.

For context-menu commands:

- keep the Discord-specific extraction logic here
- send only the minimum payload Sharply needs

## Internal API Rules

Use `src/utils/sharply-api.ts` as the integration boundary.

When extending it:

- return typed helpers for each Sharply endpoint
- keep one helper per command use case unless there is an obvious shared shape
- send the bearer token on every request
- fail loudly when Sharply returns non-2xx responses

Do not let raw `fetch()` calls spread across command files if the API client should own them.

## Docs Sync Rules

If command behavior, names, examples, or categories change, update:

- this repo's command implementation
- deployment behavior if needed
- `sharply`'s mirrored command manifest: `src/data/discord-command-manifest.json`
- cross-repo contract docs if ownership or workflow changed

Do not leave the site docs stale after command changes.

## Verify The Right Things

After significant bot changes, run:

```bash
npm run lint
npm run typecheck
```

If command registration behavior changed, also test:

```bash
npm run clear-commands
npm run clear-commands:global
npm run deploy-commands
```

If the change touches the Sharply contract, also verify in the Sharply app repo:

```bash
cd ../sharply
SKIP_ENV_VALIDATION=1 npm run lint
npm run typecheck
```

## Default Decision Rule

When unsure where code belongs:

- Discord UX or command lifecycle: keep it in `sharply-bot`.
- product logic, identity mapping, or data truth: put it in `sharply`.
- cross-repo features: keep the boundary at the authenticated HTTP contract.
