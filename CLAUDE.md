# Flight Path

## Overview

Flight Path is a static Eleventy (11ty) site that visualizes POAP Airport Rally activity.

The site provides:

- A **leaderboard-first landing page** with split-flap departure board aesthetic
- **Teams** — players grouped by ENS names, POAP holdings, home airport, start month, or anon status
- Leaderboards for teams, travelers, airports, and regions
- An interactive **3D globe** (secondary view) with flight path animations
- URL state management for deep-linking to views and addresses

All data is generated locally via a Python script, cached in SQLite, and committed as JSON to the repository. Team definitions are managed in Airtable. There is no runtime backend.

---

## Core Architecture

### Data Layer (Python + SQLite)

The script `scripts/fetch_data.py`:

- Reads `airports.csv` for the airport registry
- Fetches claims from the POAP API
- Syncs team definitions from Airtable
- Fetches POAP holders for team membership (POAP-based teams)
- Computes teams and leaderboards
- Caches everything in SQLite (`data/flightpath.db`, gitignored)
- Exports JSON files to `_data/` for 11ty consumption
- Includes change detection — skips JSON export if data hasn't changed

The script runs daily (automated) and can also be run manually.

#### POAP API

- **Auth endpoint:** `POST https://auth.accounts.poap.xyz/oauth/token` (client_credentials grant)
- **Claims endpoint:** `GET https://api.poap.tech/event/{id}/poaps`
- **Pagination:** offset + limit query params (max 300 per page)
- **Auth headers:** Both `Authorization: Bearer {token}` and `X-API-Key` required
- **Token expiry:** 24 hours; max 4 token requests/hour
- **Credentials:** Read from `.env` file — never committed
- **API reference:** `docs/poap-agent-api-docs/` (git subtree)

#### Airtable (Team Admin)

- **Base ID:** stored in `.env` as `AIRTABLE_BASE_ID`
- **Teams table:** Name, Type (ens_regex/poap_holders), Pattern, Event IDs, Description, Active
- Used for configured team definitions only (ENS regex teams, POAP holder teams)
- Auto-computed teams (Anon, Home Airport, Month Started) don't need Airtable config

#### SQLite Schema (`data/flightpath.db`)

- `airports` — airport metadata with coordinates
- `claims` — all POAP claims (address, airport, timestamp, ENS)
- `team_config` — synced from Airtable
- `team_event_holders` — cached POAP holders for team events (refreshed weekly)
- `meta` — run metadata (data_hash for change detection, last_holder_refresh)

---

### Frontend Layer (11ty + JS)

- **Landing page:** Full-viewport split-flap leaderboard (`src/js/app.js`, `src/css/styles.css`)
- **Globe:** Lazy-loaded on "View Globe" click using Globe.gl
- **Framework:** Vanilla JavaScript (no React)
- **Deploy:** GitHub Pages via 11ty
- **Analytics:** Tinylytics

#### Teams

Five team types:

| Type | Source | Configuration |
|------|--------|---------------|
| ENS Regex | Match ENS name against regex | Airtable |
| POAP Holders | Address holds specific POAPs | Airtable |
| Team Anon | No ENS name | Auto-computed |
| Home Airport | First airport POAP claimed | Auto-computed |
| Month Started | Month of first claim | Auto-computed |

Players can be on multiple teams. Team score = total Airport POAPs collected by all members.

---

## Design System

### Split-Flap Board (Primary)

The leaderboard uses a departure board aesthetic:

- Dark background (`#0a0a2e`)
- Warm amber-white text (`#f0e6d3`)
- Roboto Mono (Google Fonts) for board text
- Horizontal split lines through each table cell
- Team type badges: purple (ENS), pink (POAP), teal (Home), blue (Month), gray (Anon)

### POAP Brand Colors

| Role | Hex | Notes |
|------|-----|-------|
| Primary | `#8076FA` | Main purple accent |
| Primary light | `#9289FF` | Buttons, highlights |
| Primary deep | `#7168DE` | Hover states |
| Secondary | `#F87588` | Pink accent |
| Success | `#0FCEAD` | Teal/green |

### Typography

- **Headings:** Comfortaa (Google Fonts)
- **Body:** Rubik (Google Fonts)
- **Board/Mono:** Roboto Mono (Google Fonts)

---

## Design Principles

- Keep it simple.
- Prefer clarity over cleverness.
- Avoid unnecessary abstractions.
- Airtable for admin config only (team definitions).
- Optimize for readability and iteration.

---

## Data Files

### Input

- `airports.csv` — Source of truth for airport list. Columns: Drop ID, gallery URL, RSS URL, Title, (unused boolean), Airport Code, Continent. Ignore the PASS row.

### Generated (by Python script, committed to repo)

- `_data/airports.json` — Airport details with coordinates, claim counts
- `_data/claims.json` — All claims with address, airport, timestamp
- `_data/leaderboards.json` — Pre-computed leaderboard data
- `_data/teams.json` — Team definitions, members, and leaderboard
- `_data/meta.json` — Last updated timestamp and data hash

### Cached (gitignored)

- `data/flightpath.db` — SQLite database with all fetched and computed data

---

## Goal

Build a clean, deterministic, static visualization system that makes the Airport Rally feel global, active, and narrative-driven. Teams add a social/competitive layer that increases engagement.

Keep the implementation straightforward and well-structured so it can evolve later.
