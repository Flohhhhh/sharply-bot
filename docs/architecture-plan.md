# Discord Bot Hybrid Architecture Plan

## Core Idea
Split responsibilities between:
- **Next.js (stateless, request-driven)**
- **Railway bot (persistent runtime)**

---

## Responsibilities

### 1. Next.js (Interaction Layer)
Handles:
- Slash commands
- Buttons / modals
- Webhook validation (Discord signatures)
- Fast responses (≤3s)

Behavior:
- Respond immediately OR
- Enqueue job for async processing

---

### 2. Railway Bot (Runtime Layer)
Handles:
- Gateway events (messageCreate, reactions, joins, etc.)
- Background jobs
- Scheduled tasks
- Long-running workflows
- Follow-up messages to Discord

---

## Data / Communication Layer

Use shared system:
- Redis (preferred for queue)
- OR Postgres (jobs table)

Flow:
1. Interaction hits Next.js
2. Next.js validates + acks
3. Push job → queue/db
4. Railway bot consumes job
5. Bot executes + sends result to Discord

---

## Shared Logic (Critical)

Create a shared package:
- Command definitions
- Business logic
- Discord helpers

Both systems import this:
- Prevents duplication
- Keeps behavior consistent

---

## Rules (Avoid Problems)

- Do NOT handle same interaction in both places
- Do NOT duplicate command logic
- Do NOT rely on in-memory state
- Use DB/queue for all cross-system state

---

## Mental Model

- Next.js = **entry point**
- Railway = **engine**
- Queue/DB = **bridge**

---

## Migration Strategy (Optional)

Phase 1:
- Keep all interactions in Next.js
- Add Railway for background tasks

Phase 2:
- Move more logic into shared layer

Phase 3 (optional):
- Move interactions fully to Railway if needed

---

## Result

- Fast, reliable interactions
- Scalable async processing
- Clean separation of concerns
- No conflicts between systems