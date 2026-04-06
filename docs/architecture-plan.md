# Discord Bot Architecture

## Core Idea

Split responsibilities between:

- **Sharply (source of truth / internal API)**
- **Persistent bot runtime (Discord-facing runtime)**

See also: `docs/frontend-bot-contract.md` for the full cross-repo contract, alignment rules, and maintenance checklist.

---

## Responsibilities

### 1. Persistent Bot (Interaction Layer)

Handles:

- Slash commands
- Message context commands
- Discord gateway interaction routing
- Fast responses (≤3s)

Behavior:

- Reply immediately for fast commands
- Defer replies for slower network-backed commands

---

### 2. Sharply App (Data / Logic Layer)

Handles:

- Gear search and compare resolution
- Pricing and metrics reads
- Trending data and message-to-gear resolution
- Any app-owned mutations exposed to the bot later

---

## Data / Communication Layer

Use authenticated internal HTTP endpoints.

Flow:

1. User triggers a command in Discord
2. Bot receives the interaction over the gateway
3. Bot calls authenticated Sharply internal endpoints
4. Sharply returns structured data
5. Bot formats and sends the Discord response

---

## Shared Logic (Critical)

Keep command ownership inside the bot repo.
Keep app/business logic inside Sharply.
Sync public command documentation into Sharply from the bot-owned command set.

---

## Rules (Avoid Problems)

- Do NOT handle the same interaction in both repos
- Do NOT import Sharply server modules directly into the bot
- Do NOT expose bot-facing app endpoints without internal auth
- Keep Discord formatting in the bot; keep data truth in Sharply

---

## Mental Model

- Bot = **entry point + Discord interface**
- Sharply = **engine + source of truth**
- Internal API = **bridge**

---

## Migration Strategy (Optional)

Phase 1:

- Expose authenticated Sharply endpoints for bot use
- Move all Discord command registration and handling into the bot

Phase 2:

- Add additional bot-only features on top of the same internal API contract

---

## Result

- Fast, reliable interactions
- Clean separation of concerns
- Clear ownership boundaries between bot UI and app logic
