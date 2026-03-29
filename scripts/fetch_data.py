#!/usr/bin/env python3
"""
Fetch POAP Airport Rally claim data and generate JSON for the static site.

Fetches airports from Airtable, claims from the POAP API, enriches with
coordinates, computes teams and leaderboards, and outputs JSON files to _data/.

Uses SQLite as a local cache/compute layer for incremental fetching and
change detection. Team and airport definitions are managed in Airtable.
"""

import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

POAP_CLIENT_ID = os.environ["POAP_CLIENT_ID"]
POAP_CLIENT_SECRET = os.environ["POAP_CLIENT_SECRET"]
POAP_API_KEY = os.environ["POAP_API_KEY"]

# Airtable (optional — teams feature disabled if not set)
AIRTABLE_PAT = os.environ.get("AIRTABLE_PAT", "")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID", "")
AIRTABLE_TEAMS_TABLE = os.environ.get("AIRTABLE_TEAMS_TABLE", "Teams")
AIRTABLE_AIRPORTS_TABLE = os.environ.get("AIRTABLE_AIRPORTS_TABLE", "Airports")

AUTH_URL = "https://auth.accounts.poap.xyz/oauth/token"
API_BASE = "https://api.poap.tech"

PAGE_SIZE = 300
REQUEST_DELAY = 0.25  # seconds between API calls
HOLDER_REFRESH_DAYS = 7  # days between team event holder refreshes
API_RETRIES = 3  # retries on transient failures



# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------

DB_PATH = ROOT / "data" / "flightpath.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS airports (
    code TEXT PRIMARY KEY,
    event_id INTEGER UNIQUE NOT NULL,
    title TEXT,
    continent TEXT,
    lat REAL,
    lon REAL,
    city TEXT,
    country TEXT,
    name TEXT,
    image_url TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS claims (
    address TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    airport TEXT NOT NULL,
    ens TEXT DEFAULT '',
    created TEXT,
    token_id TEXT DEFAULT '',
    PRIMARY KEY (address, event_id)
);

CREATE TABLE IF NOT EXISTS team_config (
    airtable_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    pattern TEXT,
    event_ids TEXT,
    description TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    synced_at TEXT
);

CREATE TABLE IF NOT EXISTS team_event_holders (
    event_id INTEGER NOT NULL,
    address TEXT NOT NULL,
    ens TEXT DEFAULT '',
    fetched_at TEXT,
    PRIMARY KEY (event_id, address)
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def init_db():
    """Create or open the SQLite database and ensure schema exists."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    db.commit()
    return db


def get_meta(db, key):
    row = db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_meta(db, key, value):
    db.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, str(value))
    )
    db.commit()


# ---------------------------------------------------------------------------
# POAP API helpers
# ---------------------------------------------------------------------------


def get_access_token(db=None):
    """Obtain a Bearer token via client_credentials grant, with optional caching."""
    # Check for cached token
    if db:
        cached = get_meta(db, "access_token")
        expires = get_meta(db, "access_token_expires")
        if cached and expires:
            try:
                exp_dt = datetime.fromisoformat(expires)
                if datetime.now(timezone.utc) < exp_dt:
                    print("   → Using cached token")
                    return cached
            except ValueError:
                pass

    resp = requests.post(
        AUTH_URL,
        json={
            "audience": "https://api.poap.tech",
            "grant_type": "client_credentials",
            "client_id": POAP_CLIENT_ID,
            "client_secret": POAP_CLIENT_SECRET,
        },
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data["access_token"]

    # Cache token with 23h TTL (tokens last 24h, leave 1h buffer)
    if db:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(hours=23)
        set_meta(db, "access_token", token)
        set_meta(db, "access_token_expires", expires_at.isoformat())

    return token


def api_headers(token):
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "X-API-Key": POAP_API_KEY,
    }


def api_key_headers():
    """Headers for endpoints that only need the API key (no Bearer token)."""
    return {
        "Accept": "application/json",
        "X-API-Key": POAP_API_KEY,
    }


def api_request(method, url, retries=API_RETRIES, **kwargs):
    """Make an API request with retry on transient failures and rate limits."""
    import random

    kwargs.setdefault("timeout", 30)
    for attempt in range(retries):
        try:
            resp = requests.request(method, url, **kwargs)
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 2 ** (attempt + 1)))
                wait = retry_after + random.uniform(0, 1)
                if attempt < retries - 1:
                    print(f"    Rate limited, retry {attempt + 1}/{retries} after {wait:.1f}s")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
            resp.raise_for_status()
            return resp
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1) + random.uniform(0, 1)
                print(f"    Retry {attempt + 1}/{retries} after {wait:.1f}s: {e}")
                time.sleep(wait)
            else:
                raise


def parse_poap_owner(poap):
    """Extract address and ENS from a POAP owner field."""
    owner = poap.get("owner", {})
    if isinstance(owner, str):
        return owner.lower(), ""
    address = owner.get("id", "")
    ens = owner.get("ens", "") or ""
    return address.lower() if address else "", ens


def fetch_event_poaps(event_id, token):
    """Fetch all POAPs (claims) for a given event, handling pagination."""
    all_tokens = []
    offset = 0
    while True:
        url = f"{API_BASE}/event/{event_id}/poaps"
        params = {"offset": offset, "limit": PAGE_SIZE}
        resp = api_request(
            "get", url, headers=api_headers(token), params=params
        )
        data = resp.json()

        tokens = data.get("tokens", data) if isinstance(data, dict) else data
        if not tokens:
            break

        all_tokens.extend(tokens)

        if isinstance(data, dict) and "total" in data:
            if offset + PAGE_SIZE >= data["total"]:
                break
        elif len(tokens) < PAGE_SIZE:
            break

        offset += PAGE_SIZE
        time.sleep(REQUEST_DELAY)

    return all_tokens


def fetch_event_details(event_id, token):
    """Fetch event details including image URL."""
    url = f"{API_BASE}/events/id/{event_id}"
    resp = api_request("get", url, headers=api_headers(token))
    return resp.json()


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_airports_from_airtable():
    """Fetch airports from Airtable Airports table."""
    if not AIRTABLE_PAT or not AIRTABLE_BASE_ID:
        raise RuntimeError("Airtable credentials required for airports data")

    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_AIRPORTS_TABLE}"
    headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}
    airports = []
    offset = None

    while True:
        params = {}
        if offset:
            params["offset"] = offset
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        for record in data.get("records", []):
            fields = record.get("fields", {})
            code = fields.get("Airport Code", "").strip()
            if not code or code == "PASS":
                continue
            airports.append(
                {
                    "event_id": int(fields.get("Drop ID", 0)),
                    "title": fields.get("Title", ""),
                    "code": code,
                    "continent": fields.get("Continent", ""),
                    "lat": fields.get("Latitude", 0) or 0,
                    "lon": fields.get("Longitude", 0) or 0,
                    "city": fields.get("City", ""),
                    "country": fields.get("Country", ""),
                    "name": fields.get("Name", "") or fields.get("Title", ""),
                }
            )

        offset = data.get("offset")
        if not offset:
            break

    return airports


def upsert_airports(db, airports):
    """Upsert airport records into SQLite."""
    for a in airports:
        db.execute(
            """INSERT OR REPLACE INTO airports
               (code, event_id, title, continent, lat, lon, city, country, name, image_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                a["code"],
                a["event_id"],
                a.get("title", ""),
                a.get("continent", ""),
                a.get("lat", 0),
                a.get("lon", 0),
                a.get("city", ""),
                a.get("country", ""),
                a.get("name", ""),
                a.get("image_url", ""),
            ),
        )
    db.commit()


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------


def fetch_event_images(airports, token):
    """Fetch event details and download images locally."""
    img_dir = ROOT / "src" / "img" / "poaps"
    img_dir.mkdir(parents=True, exist_ok=True)

    for i, airport in enumerate(airports):
        eid = airport["event_id"]
        code = airport["code"]
        print(f"  [{i + 1}/{len(airports)}] {code} (event {eid})...")
        try:
            details = fetch_event_details(eid, token)
            remote_url = details.get("image_url", "")
            if remote_url:
                # Download image locally
                ext = remote_url.rsplit(".", 1)[-1].split("?")[0] or "png"
                filename = f"{code.lower()}.{ext}"
                local_path = img_dir / filename
                if not local_path.exists():
                    img_resp = requests.get(remote_url, timeout=30)
                    img_resp.raise_for_status()
                    local_path.write_bytes(img_resp.content)
                    print(f"    → downloaded {filename}")
                else:
                    print(f"    → {filename} (cached)")
                airport["image_url"] = f"/img/poaps/{filename}"
            else:
                print(f"    → no image")
                airport["image_url"] = ""
        except Exception as e:
            print(f"    WARNING: Could not fetch event image: {e}")
            airport["image_url"] = ""
        time.sleep(REQUEST_DELAY)


def process_claims(db, airports, token):
    """Fetch claims for all airports and upsert into SQLite."""
    total_new = 0
    db.execute("BEGIN")
    for i, airport in enumerate(airports):
        eid = airport["event_id"]
        code = airport["code"]
        print(f"  [{i + 1}/{len(airports)}] Fetching {code} (event {eid})...")

        poaps = fetch_event_poaps(eid, token)
        count = len(poaps)
        print(f"    → {count} claims")

        for poap in poaps:
            address, ens = parse_poap_owner(poap)
            if not address:
                continue
            created = poap.get("created", "")
            if not created:
                continue

            db.execute(
                """INSERT OR REPLACE INTO claims
                   (address, event_id, airport, ens, created, token_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    address,
                    eid,
                    code,
                    ens,
                    created,
                    poap.get("tokenId", ""),
                ),
            )
            total_new += 1

        time.sleep(REQUEST_DELAY)

    db.commit()
    return total_new


# ---------------------------------------------------------------------------
# Airtable sync
# ---------------------------------------------------------------------------


def sync_team_config(db):
    """Fetch team definitions from Airtable and sync to SQLite."""
    if not AIRTABLE_PAT or not AIRTABLE_BASE_ID:
        print("   Airtable not configured — skipping team config sync")
        return

    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TEAMS_TABLE}"
    headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        records = resp.json().get("records", [])
    except Exception as e:
        print(f"   WARNING: Airtable fetch failed, keeping existing config: {e}")
        return

    now = datetime.now(timezone.utc).isoformat()

    # Clear old config and insert fresh (only after successful fetch)
    db.execute("BEGIN")
    db.execute("DELETE FROM team_config")
    for record in records:
        fields = record.get("fields", {})
        if not fields.get("Active"):
            continue
        db.execute(
            """INSERT OR REPLACE INTO team_config
               (airtable_id, name, type, pattern, event_ids, description, active, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record["id"],
                fields.get("Name", ""),
                fields.get("Type", ""),
                fields.get("Pattern", ""),
                fields.get("Event IDs", ""),
                fields.get("Description", ""),
                1 if fields.get("Active") else 0,
                now,
            ),
        )

    db.commit()
    synced = db.execute("SELECT name, type, event_ids FROM team_config").fetchall()
    for t in synced:
        print(f"   → {t['name']} (type={t['type']}, event_ids={t['event_ids']!r})")
    print(f"   Synced {len(synced)} team configs from Airtable")


# ---------------------------------------------------------------------------
# Team event holders (POAP-based teams)
# ---------------------------------------------------------------------------


def fetch_team_event_holders(db, token):
    """Fetch holders for POAP-based team events. Refreshes weekly."""
    last_refresh = get_meta(db, "last_holder_refresh")
    if last_refresh:
        days_since = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(last_refresh)
        ).days
        if days_since < HOLDER_REFRESH_DAYS:
            print(f"   Holder cache is {days_since}d old (refresh at {HOLDER_REFRESH_DAYS}d) — skipping")
            return

    # Collect all event IDs from poap_holders teams
    rows = db.execute(
        "SELECT event_ids FROM team_config WHERE type = 'poap_holders' AND active = 1"
    ).fetchall()

    all_event_ids = set()
    for row in rows:
        if row["event_ids"]:
            for eid in row["event_ids"].split(","):
                eid = eid.strip()
                if eid.isdigit():
                    all_event_ids.add(int(eid))

    if not all_event_ids:
        print("   No POAP-based team events to fetch")
        return

    print(f"   Fetching holders for {len(all_event_ids)} team events...")
    for eid in sorted(all_event_ids):
        print(f"     Event {eid}...")
        try:
            poaps = fetch_event_poaps(eid, token)
            now = datetime.now(timezone.utc).isoformat()
            for poap in poaps:
                address, ens = parse_poap_owner(poap)
                if not address:
                    continue
                db.execute(
                    """INSERT OR REPLACE INTO team_event_holders
                       (event_id, address, ens, fetched_at)
                       VALUES (?, ?, ?, ?)""",
                    (eid, address, ens, now),
                )
            print(f"       → {len(poaps)} holders")
        except Exception as e:
            print(f"       WARNING: Failed to fetch event {eid}: {e}")
        time.sleep(REQUEST_DELAY)

    db.commit()
    set_meta(db, "last_holder_refresh", datetime.now(timezone.utc).isoformat())


# ---------------------------------------------------------------------------
# Team computation
# ---------------------------------------------------------------------------


def slugify(text):
    """Create a URL-friendly slug from text."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def compute_teams(db):
    """Compute all teams from SQLite data. Returns list of team dicts."""
    teams = []

    # Pre-compute per-address stats from claims
    address_stats = {}  # {address: {ens, airport_count, total_claims, airports, first_claim, first_airport}}
    rows = db.execute(
        """SELECT address, ens, airport, created FROM claims ORDER BY created ASC"""
    ).fetchall()

    for row in rows:
        addr = row["address"]
        if addr not in address_stats:
            address_stats[addr] = {
                "ens": row["ens"],
                "airports": set(),
                "total_claims": 0,
                "first_claim": row["created"],
                "first_airport": row["airport"],
            }
        stats = address_stats[addr]
        stats["airports"].add(row["airport"])
        stats["total_claims"] += 1
        # Keep most recent ENS (non-empty)
        if row["ens"]:
            stats["ens"] = row["ens"]

    def build_team(team_id, name, team_type, description, member_addresses):
        """Build a team dict from a set of member addresses."""
        members = []
        total_claims = 0
        all_airports = set()
        for addr in sorted(member_addresses):
            stats = address_stats.get(addr)
            if not stats:
                continue
            members.append(
                {
                    "address": addr,
                    "ens": stats["ens"],
                    "airport_count": len(stats["airports"]),
                }
            )
            total_claims += stats["total_claims"]
            all_airports.update(stats["airports"])

        if not members:
            return None

        return {
            "id": team_id,
            "name": name,
            "type": team_type,
            "description": description,
            "members": sorted(members, key=lambda m: m["airport_count"], reverse=True),
            "member_count": len(members),
            "total_claims": total_claims,
            "unique_airports": len(all_airports),
            "airports": sorted(all_airports),
        }

    # --- Configured teams (from Airtable) ---

    # ENS regex teams
    ens_teams = db.execute(
        "SELECT * FROM team_config WHERE type = 'ens_regex' AND active = 1"
    ).fetchall()
    for tc in ens_teams:
        pattern = tc["pattern"]
        if not pattern:
            continue
        # Reject overly complex patterns (nested quantifiers, excessive length)
        if len(pattern) > 200 or re.search(r"(\.\*){3,}", pattern):
            print(f"   WARNING: Regex too complex for team '{tc['name']}': {pattern}")
            continue
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error:
            print(f"   WARNING: Invalid regex for team '{tc['name']}': {pattern}")
            continue

        matching = set()
        for addr, stats in address_stats.items():
            if stats["ens"] and regex.match(stats["ens"]):
                matching.add(addr)

        team = build_team(
            f"ens-{slugify(tc['name'])}",
            tc["name"],
            "ens_regex",
            tc["description"] or "",
            matching,
        )
        if team:
            teams.append(team)

    # POAP holder teams
    poap_teams = db.execute(
        "SELECT * FROM team_config WHERE type = 'poap_holders' AND active = 1"
    ).fetchall()
    for tc in poap_teams:
        if not tc["event_ids"]:
            continue
        event_ids = [
            int(e.strip()) for e in tc["event_ids"].split(",") if e.strip().isdigit()
        ]
        if not event_ids:
            continue

        # Find rally participants who also hold any of these team POAPs
        placeholders = ",".join("?" * len(event_ids))
        holder_rows = db.execute(
            f"""SELECT DISTINCT address FROM team_event_holders
                WHERE event_id IN ({placeholders})""",
            event_ids,
        ).fetchall()
        holder_addrs = {r["address"] for r in holder_rows}

        # Intersect with rally participants
        matching = holder_addrs & set(address_stats.keys())

        team = build_team(
            f"poap-{slugify(tc['name'])}",
            tc["name"],
            "poap_holders",
            tc["description"] or "",
            matching,
        )
        if team:
            teams.append(team)

    # --- Auto-computed teams ---

    # Team Anon: addresses without ENS
    anon_addrs = {addr for addr, stats in address_stats.items() if not stats["ens"]}
    team = build_team("auto-anon", "Team Anon", "anon", "Collectors without ENS names", anon_addrs)
    if team:
        teams.append(team)

    # Home Airport: grouped by first airport claimed
    home_groups = defaultdict(set)
    for addr, stats in address_stats.items():
        home_groups[stats["first_airport"]].add(addr)

    for airport_code, addrs in sorted(home_groups.items()):
        # Look up airport name
        airport_row = db.execute(
            "SELECT name, city FROM airports WHERE code = ?", (airport_code,)
        ).fetchone()
        airport_name = airport_row["name"] if airport_row else airport_code
        team = build_team(
            f"home-{airport_code.lower()}",
            f"Home: {airport_code}",
            "first_airport",
            f"First airport claimed: {airport_name}",
            addrs,
        )
        if team:
            teams.append(team)

    # Month Started: grouped by month of first claim
    month_groups = defaultdict(set)
    for addr, stats in address_stats.items():
        if stats["first_claim"]:
            try:
                dt = datetime.fromisoformat(stats["first_claim"].replace(" ", "T"))
                month_key = dt.strftime("%Y-%m")
                month_name = dt.strftime("%B %Y")
            except ValueError:
                continue
            month_groups[(month_key, month_name)].add(addr)

    for (month_key, month_name), addrs in sorted(month_groups.items()):
        team = build_team(
            f"month-{month_key}",
            f"Started: {month_name}",
            "month_started",
            f"Collectors who started in {month_name}",
            addrs,
        )
        if team:
            teams.append(team)

    return teams


# ---------------------------------------------------------------------------
# ENS avatars
# ---------------------------------------------------------------------------


def fetch_ens_avatars(db):
    """Fetch ENS avatar images for addresses with ENS names.
    Skips re-fetching if the avatar file was modified within the last 7 days."""
    img_dir = ROOT / "src" / "img" / "avatars"
    img_dir.mkdir(parents=True, exist_ok=True)

    avatar_max_age = 7 * 24 * 3600  # 7 days in seconds

    # Get all unique ENS names
    rows = db.execute(
        "SELECT DISTINCT address, ens FROM claims WHERE ens != ''"
    ).fetchall()

    avatars = {}  # address -> local path
    fetched = 0
    for i, row in enumerate(rows):
        ens = row["ens"]
        address = row["address"]
        filename = f"{address}.png"
        local_path = img_dir / filename

        if local_path.exists():
            avatars[address] = f"/img/avatars/{filename}"
            # Skip re-fetch if file is recent enough
            age = time.time() - local_path.stat().st_mtime
            if age < avatar_max_age:
                continue

        # Try ENS metadata service
        try:
            url = f"https://metadata.ens.domains/mainnet/avatar/{ens}"
            resp = requests.get(url, timeout=10, allow_redirects=True)
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image"):
                local_path.write_bytes(resp.content)
                avatars[address] = f"/img/avatars/{filename}"
                fetched += 1
                print(f"  [{i + 1}/{len(rows)}] {ens} → downloaded avatar")
            else:
                print(f"  [{i + 1}/{len(rows)}] {ens} → no avatar")
        except Exception as e:
            print(f"  [{i + 1}/{len(rows)}] {ens} → error: {e}")

        time.sleep(REQUEST_DELAY)

    if fetched:
        print(f"   {fetched} new/refreshed avatars")

    return avatars


# ---------------------------------------------------------------------------
# Leaderboards (from SQLite)
# ---------------------------------------------------------------------------


def build_leaderboards(db, avatars=None):
    """Compute leaderboard data from SQLite."""
    avatars = avatars or {}

    # Address leaderboard
    rows = db.execute(
        """SELECT address, GROUP_CONCAT(DISTINCT airport) as airports,
                  COUNT(DISTINCT airport) as airport_count
           FROM claims GROUP BY address ORDER BY airport_count DESC"""
    ).fetchall()

    # Get best ENS per address
    ens_rows = db.execute(
        """SELECT address, ens FROM claims WHERE ens != ''
           ORDER BY created DESC"""
    ).fetchall()
    address_ens = {}
    for r in ens_rows:
        if r["address"] not in address_ens:
            address_ens[r["address"]] = r["ens"]

    address_leaderboard = [
        {
            "address": r["address"],
            "ens": address_ens.get(r["address"], ""),
            "airport_count": r["airport_count"],
            "airports": sorted(r["airports"].split(",")),
            "avatar_url": avatars.get(r["address"], ""),
        }
        for r in rows
    ]

    # Airport leaderboard
    airport_rows = db.execute(
        """SELECT a.code, a.name, a.city, a.continent,
                  COUNT(c.address) as claims
           FROM airports a
           LEFT JOIN claims c ON c.airport = a.code
           GROUP BY a.code
           ORDER BY claims DESC, a.code ASC"""
    ).fetchall()

    airport_leaderboard = [
        {
            "code": r["code"],
            "name": r["name"] or r["code"],
            "city": r["city"] or "",
            "continent": r["continent"] or "",
            "claims": r["claims"],
        }
        for r in airport_rows
    ]

    # Region leaderboard
    region_rows = db.execute(
        """SELECT a.continent,
                  COUNT(c.address) as claims,
                  COUNT(DISTINCT a.code) as airport_count
           FROM claims c
           JOIN airports a ON c.airport = a.code
           WHERE a.continent != ''
           GROUP BY a.continent
           ORDER BY claims DESC"""
    ).fetchall()

    region_leaderboard = [
        {
            "continent": r["continent"],
            "claims": r["claims"],
            "airport_count": r["airport_count"],
        }
        for r in region_rows
    ]

    return {
        "addresses": address_leaderboard,
        "airports": airport_leaderboard,
        "regions": region_leaderboard,
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export_json(db, airports, teams, avatars=None):
    """Export all data to JSON files for 11ty consumption."""
    data_dir = ROOT / "_data"
    data_dir.mkdir(exist_ok=True)

    # Airports JSON (with claim counts from SQLite — single query)
    claim_counts = {}
    for row in db.execute(
        "SELECT airport, COUNT(*) as cnt FROM claims GROUP BY airport"
    ).fetchall():
        claim_counts[row["airport"]] = row["cnt"]
    airports_out = [{**a, "claims": claim_counts.get(a["code"], 0)} for a in airports]

    # Claims JSON
    claim_rows = db.execute("SELECT * FROM claims ORDER BY created ASC").fetchall()
    claims_out = [
        {
            "address": r["address"],
            "ens": r["ens"],
            "airport": r["airport"],
            "event_id": r["event_id"],
            "created": r["created"],
            "token_id": r["token_id"],
        }
        for r in claim_rows
    ]

    # Leaderboards
    leaderboards = build_leaderboards(db, avatars=avatars)

    # Teams
    teams_leaderboard = sorted(
        [
            {
                "id": t["id"],
                "name": t["name"],
                "type": t["type"],
                "member_count": t["member_count"],
                "total_claims": t["total_claims"],
                "unique_airports": t["unique_airports"],
            }
            for t in teams
        ],
        key=lambda t: t["total_claims"],
        reverse=True,
    )
    teams_out = {"teams": teams, "leaderboard": teams_leaderboard}

    # Meta
    meta = {"last_updated": datetime.now(timezone.utc).isoformat()}

    # Compute data hash for change detection
    all_data = json.dumps(
        {
            "airports": airports_out,
            "claims": claims_out,
            "leaderboards": leaderboards,
            "teams": teams_out,
        },
        sort_keys=True,
    )
    data_hash = hashlib.sha256(all_data.encode()).hexdigest()[:16]

    # Check for changes
    prev_hash = get_meta(db, "data_hash")
    if prev_hash == data_hash:
        print("   No data changes detected — skipping JSON export")
        return False

    # Write files
    with open(data_dir / "airports.json", "w") as f:
        json.dump(airports_out, f, indent=2)
    print(f"   → _data/airports.json ({len(airports_out)} airports)")

    with open(data_dir / "claims.json", "w") as f:
        json.dump(claims_out, f, indent=2)
    print(f"   → _data/claims.json ({len(claims_out)} claims)")

    with open(data_dir / "leaderboards.json", "w") as f:
        json.dump(leaderboards, f, indent=2)
    print(f"   → _data/leaderboards.json")

    with open(data_dir / "teams.json", "w") as f:
        json.dump(teams_out, f, indent=2)
    print(f"   → _data/teams.json ({len(teams)} teams)")

    meta["data_hash"] = data_hash
    with open(data_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"   → _data/meta.json")

    set_meta(db, "data_hash", data_hash)
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("Flight Path — POAP data fetch\n")

    db = None
    try:
        print("1. Initializing database...")
        db = init_db()
        print(f"   → {DB_PATH}")

        print("2. Loading airports from Airtable...")
        airports = load_airports_from_airtable()
        print(f"   {len(airports)} airports loaded")

        print("3. Upserting airports into SQLite...")
        upsert_airports(db, airports)

        print("4. Authenticating with POAP API...")
        token = get_access_token(db)
        print("   ✓ Token obtained")

        print("5. Fetching event details (images)...")
        fetch_event_images(airports, token)

        print("6. Fetching claims → SQLite...")
        total = process_claims(db, airports, token)
        claim_count = db.execute("SELECT COUNT(*) as cnt FROM claims").fetchone()["cnt"]
        print(f"   Total: {claim_count} claims in database")

        print("7. Syncing team config from Airtable...")
        sync_team_config(db)

        print("8. Fetching team event holders...")
        fetch_team_event_holders(db, token)

        print("9. Fetching ENS avatars...")
        avatars = fetch_ens_avatars(db)
        print(f"   {len(avatars)} avatars cached")

        print("10. Computing teams...")
        teams = compute_teams(db)
        print(f"   {len(teams)} teams computed")

        print("11. Exporting JSON files...")
        changed = export_json(db, airports, teams, avatars=avatars)

        if changed:
            print("\n✓ Done — data updated!")
        else:
            print("\n✓ Done — no changes detected.")

    except Exception as e:
        print(f"\n✗ FAILED at runtime: {e}")
        if db:
            db.rollback()
        sys.exit(1)
    finally:
        if db:
            db.close()


if __name__ == "__main__":
    main()
