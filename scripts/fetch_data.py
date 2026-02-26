#!/usr/bin/env python3
"""
Fetch POAP Airport Rally claim data and generate JSON for the static site.

Reads airports.csv, fetches claims from the POAP API, enriches with
coordinates, and outputs JSON files to _data/.
"""

import csv
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import airportsdata
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

AUTH_URL = "https://auth.accounts.poap.xyz/oauth/token"
API_BASE = "https://api.poap.tech"

PAGE_SIZE = 300
REQUEST_DELAY = 0.25  # seconds between API calls

AIRPORTS_DB = airportsdata.load("IATA")


# ---------------------------------------------------------------------------
# POAP API helpers
# ---------------------------------------------------------------------------


def get_access_token():
    """Obtain a Bearer token via client_credentials grant."""
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
    return resp.json()["access_token"]


def api_headers(token):
    return {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "X-API-Key": POAP_API_KEY,
    }


def fetch_event_poaps(event_id, token):
    """Fetch all POAPs (claims) for a given event, handling pagination."""
    all_tokens = []
    offset = 0
    while True:
        url = f"{API_BASE}/event/{event_id}/poaps"
        params = {"offset": offset, "limit": PAGE_SIZE}
        resp = requests.get(
            url, headers=api_headers(token), params=params, timeout=30
        )
        resp.raise_for_status()
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


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_airports_csv():
    """Read airports.csv and return list of airport dicts."""
    airports = []
    with open(ROOT / "airports.csv", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) < 7:
                continue
            code = row[5].strip()
            if code == "PASS":
                continue  # skip boarding pass entry
            airports.append(
                {
                    "event_id": int(row[0].strip()),
                    "title": row[3].strip(),
                    "code": code,
                    "continent": row[6].strip(),
                }
            )
    return airports


def enrich_with_coordinates(airports):
    """Add lat/lon from airportsdata package."""
    for airport in airports:
        info = AIRPORTS_DB.get(airport["code"])
        if info:
            airport["lat"] = info["lat"]
            airport["lon"] = info["lon"]
            airport["city"] = info["city"]
            airport["country"] = info["country"]
            airport["name"] = info["name"]
        else:
            print(f"  WARNING: No coordinate data for {airport['code']}")
            airport["lat"] = 0
            airport["lon"] = 0
            airport["city"] = ""
            airport["country"] = ""
            airport["name"] = airport["title"]
    return airports


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------


def process_claims(airports, token):
    """Fetch claims for all airports and build unified data structures."""
    all_claims = []
    airport_claim_counts = defaultdict(int)

    for i, airport in enumerate(airports):
        eid = airport["event_id"]
        code = airport["code"]
        print(f"  [{i + 1}/{len(airports)}] Fetching {code} (event {eid})...")

        poaps = fetch_event_poaps(eid, token)
        count = len(poaps)
        airport_claim_counts[code] = count
        print(f"    → {count} claims")

        for poap in poaps:
            owner = poap.get("owner", {})
            address = owner if isinstance(owner, str) else owner.get("id", "")
            ens = "" if isinstance(owner, str) else owner.get("ens", "") or ""
            created = poap.get("created", "")

            all_claims.append(
                {
                    "address": address.lower(),
                    "ens": ens,
                    "airport": code,
                    "event_id": eid,
                    "created": created,
                    "token_id": poap.get("tokenId", ""),
                }
            )

        time.sleep(REQUEST_DELAY)

    return all_claims, airport_claim_counts


def build_leaderboards(airports, claims):
    """Compute leaderboard data from claims."""

    # Address leaderboard: how many unique airports each address visited
    address_airports = defaultdict(set)
    address_ens = {}
    for claim in claims:
        addr = claim["address"]
        address_airports[addr].add(claim["airport"])
        if claim["ens"]:
            address_ens[addr] = claim["ens"]

    address_leaderboard = sorted(
        [
            {
                "address": addr,
                "ens": address_ens.get(addr, ""),
                "airport_count": len(codes),
                "airports": sorted(codes),
            }
            for addr, codes in address_airports.items()
        ],
        key=lambda x: x["airport_count"],
        reverse=True,
    )

    # Airport leaderboard: claim count per airport
    airport_map = {a["code"]: a for a in airports}
    airport_claims = defaultdict(int)
    for claim in claims:
        airport_claims[claim["airport"]] += 1

    airport_leaderboard = sorted(
        [
            {
                "code": code,
                "name": airport_map[code].get("name", code),
                "city": airport_map[code].get("city", ""),
                "continent": airport_map[code].get("continent", ""),
                "claims": count,
            }
            for code, count in airport_claims.items()
            if code in airport_map
        ],
        key=lambda x: x["claims"],
        reverse=True,
    )

    # Region leaderboard: total claims per continent
    continent_claims = defaultdict(int)
    continent_airports = defaultdict(set)
    for claim in claims:
        code = claim["airport"]
        if code in airport_map:
            continent = airport_map[code]["continent"]
            continent_claims[continent] += 1
            continent_airports[continent].add(code)

    region_leaderboard = sorted(
        [
            {
                "continent": continent,
                "claims": count,
                "airport_count": len(continent_airports[continent]),
            }
            for continent, count in continent_claims.items()
            if continent
        ],
        key=lambda x: x["claims"],
        reverse=True,
    )

    return {
        "addresses": address_leaderboard,
        "airports": airport_leaderboard,
        "regions": region_leaderboard,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("Flight Path — POAP data fetch\n")

    print("1. Loading airports.csv...")
    airports = load_airports_csv()
    print(f"   {len(airports)} airports loaded")

    print("2. Enriching with coordinates...")
    airports = enrich_with_coordinates(airports)

    print("3. Authenticating with POAP API...")
    token = get_access_token()
    print("   ✓ Token obtained")

    print("4. Fetching claims...")
    claims, claim_counts = process_claims(airports, token)
    print(f"   Total: {len(claims)} claims across {len(airports)} airports")

    # Attach claim counts to airport data
    for airport in airports:
        airport["claims"] = claim_counts.get(airport["code"], 0)

    print("5. Building leaderboards...")
    leaderboards = build_leaderboards(airports, claims)
    print(
        f"   {len(leaderboards['addresses'])} addresses, "
        f"{len(leaderboards['airports'])} airports, "
        f"{len(leaderboards['regions'])} regions"
    )

    print("6. Writing JSON files...")
    data_dir = ROOT / "_data"
    data_dir.mkdir(exist_ok=True)

    with open(data_dir / "airports.json", "w") as f:
        json.dump(airports, f, indent=2)
    print(f"   → _data/airports.json ({len(airports)} airports)")

    with open(data_dir / "claims.json", "w") as f:
        json.dump(claims, f, indent=2)
    print(f"   → _data/claims.json ({len(claims)} claims)")

    with open(data_dir / "leaderboards.json", "w") as f:
        json.dump(leaderboards, f, indent=2)
    print(f"   → _data/leaderboards.json")

    print("\nDone!")


if __name__ == "__main__":
    main()
