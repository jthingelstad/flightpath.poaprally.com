# Flight Path

## Overview

Flight Path is a multi-page static Eleventy (11ty) site that visualizes POAP Airport Rally activity.

The site provides:

- A **dashboard home page** with stats, activity feed, and mini-leaderboards
- **Individual pages** for each team, traveler, and airport
- **Teams** — players grouped by ENS names, POAP holdings, home airport, start month, or anon status
- Leaderboards for teams, travelers, airports, and regions
- An interactive **3D globe** with flight path animations
- **Gauges** page with cumulative, temporal, and regional charts
- XML sitemap for all generated pages

All data is sourced via a Python script from the POAP API and Airtable, cached in SQLite, and exported as JSON. Airport and team definitions are managed in Airtable. There is no runtime backend.

---

## Core Architecture

### Data Layer (Python + SQLite)

The script `scripts/fetch_data.py`:

- Fetches airport registry from Airtable (`Airports` table)
- Fetches claims from the POAP API
- Enriches airports with coordinates via `airportsdata` package
- Syncs team definitions from Airtable (`Teams` table)
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

#### Airtable

- **Base ID:** stored in `.env` as `AIRTABLE_BASE_ID`
- **Airports table:** Airport Code, Drop ID, Title, Continent, Latitude, Longitude, City, Country, Name
- **Teams table:** Name, Type (ens_regex/poap_holders), Pattern, Event IDs, Description, Active
- Auto-computed teams (Anon, Home Airport, Month Started) don't need Airtable config
- Airport coordinates stored directly in Airtable (single source of truth for all map displays)

#### SQLite Schema (`data/flightpath.db`)

- `airports` — airport metadata with coordinates
- `claims` — all POAP claims (address, airport, timestamp, ENS)
- `team_config` — synced from Airtable
- `team_event_holders` — cached POAP holders for team events (refreshed weekly)
- `meta` — run metadata (data_hash for change detection, last_holder_refresh)

---

### Frontend Layer (11ty + Nunjucks)

Multi-page static site — each section is its own page, detail views generated via Eleventy pagination.

#### Page Structure

| Route | Template | Content |
|-------|----------|---------|
| `/` | `src/index.njk` | Dashboard: stats, activity, mini-leaderboards, regions |
| `/globe/` | `src/globe.njk` | Interactive 3D globe (Globe.gl) |
| `/teams/` | `src/teams/index.njk` | Team leaderboard |
| `/teams/{id}/` | `src/teams/team.njk` | Team detail + members (pagination) |
| `/travelers/` | `src/travelers/index.njk` | Traveler leaderboard + search |
| `/travelers/{address}/` | `src/travelers/traveler.njk` | Traveler detail + timeline (pagination) |
| `/airports/` | `src/airports/index.njk` | Airport leaderboard + region filters |
| `/airports/{code}/` | `src/airports/airport.njk` | Airport detail + claims list (pagination) |
| `/gauges/` | `src/gauges.njk` | Charts (cumulative, by month/day/region) |
| `/sitemap.xml` | `src/sitemap.njk` | XML sitemap |

#### JavaScript (page-specific, no bundler)

| File | Used on | Purpose |
|------|---------|---------|
| `src/js/globe.js` | `/globe/` | Globe initialization, flight animations, search |
| `src/js/gauges.js` | `/gauges/` | SVG area charts and bar charts |
| `src/js/search.js` | `/travelers/` | Client-side traveler search filter |
| `src/js/airport-filters.js` | `/airports/` | Region filter toggle |

- **Framework:** Vanilla JavaScript (no React, no bundler)
- **Deploy:** GitHub Pages via GitHub Actions
- **Analytics:** Tinylytics

#### Teams

Five team types:

| Type | Source | Configuration |
|------|--------|---------------|
| ENS Regex | Match ENS name against regex | Airtable |
| POAP Holders | Address holds specific POAPs | Airtable |
| Team Anon | No ENS name | Auto-computed |
| Home Airport | First airport POAP claimed | Auto-computed |
| Month Started | Month of first claim | Auto-computed (hidden from UI) |

Players can be on multiple teams. Team score = total Airport POAPs collected by all members.

---

## Design System

### Sky Gradient Theme

Inspired by POAP Airport Rally promotional art:

- **Background:** Fixed sky gradient (cyan → gold → salmon → coral) with soft pink cloud radial gradients
- **Header:** Yellow/gold banner (`#FFE44D`) with dark text
- **Tabs:** Dark charcoal strip (`#2D2D2D`) with gold active indicator
- **Table rows:** Rounded charcoal cards (`#3A3A3A`) with spacing, floating on the gradient
- **Rank numbers:** Cycle through 5 pastel colors (gold, lavender, mint, pink, sky blue)
- **Highlight values:** Gold (`#FFE44D`) for scores, airport codes, stats

### POAP Brand Colors

| Role | Hex | Notes |
|------|-----|-------|
| Primary | `#8076FA` | Purple accent |
| Primary light | `#9289FF` | Buttons, highlights |
| Gold | `#FFE44D` | Scores, header, active states |
| Secondary | `#F87588` | Pink accent |
| Success | `#0FCEAD` | Teal/green |

### Typography

- **Headings:** Comfortaa (Google Fonts)
- **Body:** Rubik (Google Fonts)
- **Data/Mono:** Roboto Mono (Google Fonts)

---

## Design Principles

- Keep it simple.
- Prefer clarity over cleverness.
- Avoid unnecessary abstractions.
- Airtable for admin config (airports, teams).
- Server-render what you can; JS only for interactivity.
- Optimize for readability and iteration.

---

## Data Files

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
