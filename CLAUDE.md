# Flight Path

## Overview

Flight Path is a static Eleventy (11ty) site that visualizes POAP Airport Rally activity.

The site will:

- Display rally airports on an interactive 3D globe
- Show which airports have the most claims
- Provide leaderboards for:
  - Claiming addresses
  - Airports
  - Regions (e.g., Europe, Asia)
- Animate a "flight path" for an address based on the order in which they claimed airport POAPs

All data is generated locally via a Python script and committed to the repository.
There is no runtime backend.

---

## Core Architecture

### Data Layer (Python)

A local Python script:

- Reads `airports.csv` which contains `{ drop_id, airport_code, continent }` per airport
- Excludes the PASS (Boarding Pass) entry — it's a token-gate, not an airport
- Pulls claim data from the POAP API (`GET /event/{id}/poaps`)
- Enriches airport codes with coordinates using an open airport dataset (e.g., OurAirports)
- Computes aggregates for:
  - Airports (claim counts)
  - Regions/continents
  - Addresses (which airports they visited, in order)
- Outputs JSON files that the static site consumes

This script is run manually.
No automation required (for now).

The output should be:
- Simple
- Deterministic
- Easy to inspect
- Designed for a small dataset (~1–2k claims max)

#### POAP API

- **Auth endpoint:** `POST https://auth.accounts.poap.xyz/oauth/token` (client_credentials grant)
- **Claims endpoint:** `GET https://api.poap.tech/event/{id}/poaps`
- **Pagination:** offset + limit query params
- **Auth headers:** Both `Authorization: Bearer {token}` and `X-API-Key` required
- **Token expiry:** 24 hours; max 4 token requests/hour
- **Credentials:** Read from `.env` file (POAP_CLIENT_ID, POAP_CLIENT_SECRET, POAP_API_KEY) — never committed

---

### Frontend Layer (11ty + JS)

The static site should:

- Use **Globe.gl** for the 3D globe visualization
- Use vanilla JavaScript (no React)
- Deploy to **GitHub Pages** via 11ty
- Track analytics with **Tinylytics**

Globe.gl was chosen over MapLibre + deck.gl because:
- Purpose-built for data visualization on a 3D globe
- First-class arc animation support (animated dashed arcs)
- Built-in hover/click/tooltip support per layer
- No tile server or API keys needed
- Simpler codebase — single library instead of two

Features:

- Airport markers sized by activity
- Hover tooltips
- Click to inspect airport
- Leaderboards (addresses, airports, regions)
- Selecting an address animates their claim sequence as arcs between airports
- Basic controls for play/pause/speed
- URL reflects state (selected address, region, etc.)

---

## Design System

Aligned with the POAP brand aesthetic — light, rounded, purple-forward.

### Colors

| Role | Hex | Notes |
|------|-----|-------|
| Primary | `#8076FA` | Main purple accent |
| Primary light | `#9289FF` | Buttons, highlights |
| Primary deep | `#7168DE` | Hover states |
| Secondary | `#F87588` | Pink accent |
| Text | `#4D5680` | Blue-tinted dark gray |
| Text muted | `#6873A4` | Secondary text |
| Background | `#FFFFFF` | Base |
| Background wash | `#F1F5FD` | Subtle lavender tint |
| Border | `#C4CAE8` | Dividers, subtle lines |
| Success | `#0FCEAD` | Teal/green |
| Error | `#FB4E4E` | Red |

### Typography

- **Headings:** Comfortaa (Google Fonts) — rounded geometric sans-serif
- **Body:** Rubik (Google Fonts) — slightly rounded sans-serif
- **Base size:** 16px

### Style Notes

- Rounded corners: `16px+` for cards, `100px` for pill buttons
- Purple-tinted box shadows (not gray)
- Blue-tinted grays throughout (never neutral gray)
- Spacious, clean layout
- Circular motifs (POAP badges are circles)

---

## Design Principles

- Keep it simple.
- Prefer clarity over cleverness.
- Avoid unnecessary abstractions.
- Avoid external systems (no Airtable, no runtime API calls).
- Optimize for readability and iteration.

---

## Scope (V1)

- Manual data sync via Python
- Static site deploy to GitHub Pages
- 3D globe rendering with Globe.gl
- Working leaderboards
- Address flight path animation

Not required:

- Live updates
- Automation
- Advanced analytics
- Data compression
- Backend services

---

## Data Files

### Input

- `airports.csv` — Source of truth for airport list. Columns: Drop ID, gallery URL, RSS URL, Title, (unused boolean), Airport Code, Continent. Ignore the PASS row.

### Generated (by Python script, committed to repo)

- `_data/airports.json` — Airport details with coordinates, claim counts
- `_data/claims.json` — All claims with address, airport, timestamp
- `_data/leaderboards.json` — Pre-computed leaderboard data

---

## Goal

Build a clean, deterministic, static visualization system that makes the Airport Rally feel global, active, and narrative-driven.

Keep the implementation straightforward and well-structured so it can evolve later.
