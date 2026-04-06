# Sharply Overview

## What is Sharply?

Sharply is a structured gear intelligence system focused on:

- Accurate, normalized photography gear data
- High-signal metadata and relationships
- Editorial + system-driven enrichment (not user-generated noise)

Within this bot ecosystem, Sharply acts as the **source of truth for gear data and enrichment logic**.

---

## Role in This Bot

Sharply powers:

- Gear lookups and validation
- Metadata enrichment (specs, mounts, aliases, regions)
- Smart responses to gear-related commands
- External content aggregation (videos, articles, etc.)

The bot is **not the data owner** — it is a **consumer + interface layer** for Sharply.

---

## Core Responsibilities

Sharply is responsible for:

### 1. Data Modeling

- Gear entities (cameras, lenses, accessories)
- Relationships (brand, mount, compatibility)
- Regional naming / aliases

### 2. Data Integrity

- Structured schema enforcement
- Change request workflows
- Evidence-backed updates (no blind edits)

### 3. Enrichment

- Specs and technical metadata
- Compatibility logic (e.g. mounts)
- Popularity and usage signals (future)

### 4. Content Layer (Curated)

- Videos from approved creators
- Articles and supporting content
- No open user-generated uploads

---

## What the Bot Handles

The bot is responsible for:

- Command parsing (e.g. `/gear`, `/compare`)
- Interaction handling (Discord UI)
- Formatting responses for chat
- Triggering background jobs (via Railway runtime)
- Bridging user input → Sharply data

---

## Data Flow

### Simple Lookup

1. User runs command
2. Bot queries Sharply API
3. Structured response returned
4. Bot formats + sends message

---

### Enriched / Async Flow

1. User triggers command
2. Interaction handled (Next.js or bot runtime)
3. Job queued (if needed)
4. Worker fetches / processes Sharply data
5. Bot sends follow-up response

---

## Integration Points

Sharply connects via:

- API (primary interface)
- Database (internal, not directly accessed by bot)
- Optional ingestion agents (for updates / change requests)

---

## Design Principles

### Structured > Flexible

All data is strongly typed and normalized.

### Curated > Crowdsourced

Only vetted sources contribute to enrichment.

### Read-Optimized

Designed for fast retrieval and presentation.

### Evidence-Based Updates

All changes should be traceable and justifiable.

---

## Non-Goals

Sharply does NOT:

- Host marketplaces or transactions
- Allow open user submissions
- Act as a social platform
- Store unverified or scraped data without validation

---

## Mental Model

- Sharply = **database + intelligence layer**
- Bot = **interface + execution layer**

---

## Future Extensions

- Popularity scoring (views, saves, usage)
- Smart recommendations
- Compatibility graph expansion
- Deeper creator/content integrations

---

## Summary

Sharply provides:

- Clean, structured gear data
- High-quality enrichment
- A reliable foundation for all gear-related features

The bot simply exposes that system in a fast, interactive way.
