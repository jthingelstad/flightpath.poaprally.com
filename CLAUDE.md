# Flight Path

## Overview

Flight Path is a static Eleventy (11ty) site that visualizes POAP Airport Rally activity.

The site will:

- Display rally airports on an interactive map
- Show which airports have the most claims
- Provide leaderboards for:
  - Claiming addresses
  - Airports
  - Regions (e.g., Europe, Asia)
- Animate a “flight path” for an address based on the order in which they claimed airport POAPs

All data is generated locally via a Python script and committed to the repository.
There is no runtime backend.

---

## Core Architecture

### Data Layer (Python)

A local Python script:

- Reads a list of `{ airport_code, event_id }`
- Pulls claim data from the POAP API
- Enriches airport codes with coordinates and region information
- Computes any aggregates needed for:
  - Airports
  - Regions
  - Addresses
- Outputs JSON files that the static site consumes

This script is run manually.
No automation required (for now).

The output should be:
- Simple
- Deterministic
- Easy to inspect
- Designed for a small dataset (~1–2k claims max)

---

### Frontend Layer (11ty + JS)

The static site should:

- Use MapLibre GL for the base map
- Use deck.gl overlays for markers and flight arcs
- Use vanilla JavaScript (no React)

Features:

- Airport markers sized by activity
- Hover tooltips
- Click to inspect airport
- Leaderboards (addresses, airports, regions)
- Selecting an address animates their claim sequence as arcs between airports
- Basic controls for play/pause/speed
- URL reflects state (selected address, region, etc.)

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
- Static site deploy
- Clean map rendering
- Working leaderboards
- Address flight path animation

Not required:

- Live updates
- Automation
- Advanced analytics
- Data compression
- Backend services

---

## Goal

Build a clean, deterministic, static visualization system that makes the Airport Rally feel global, active, and narrative-driven.

Keep the implementation straightforward and well-structured so it can evolve later.
