#!/usr/bin/env python3
"""
Generate sample data for development when the POAP API is not accessible.
Uses real airport coordinates from airportsdata but fake claim data.
Run the real fetch_data.py locally to get actual POAP data.
"""

import csv
import json
import random
from collections import defaultdict
from pathlib import Path

import airportsdata

ROOT = Path(__file__).resolve().parent.parent
AIRPORTS_DB = airportsdata.load("IATA")

random.seed(42)

# Sample addresses (fake but realistic format)
SAMPLE_ADDRESSES = [f"0x{random.randbytes(20).hex()}" for _ in range(150)]
SAMPLE_ENS = {
    SAMPLE_ADDRESSES[0]: "traveler.eth",
    SAMPLE_ADDRESSES[1]: "globetrotter.eth",
    SAMPLE_ADDRESSES[2]: "jetset.eth",
    SAMPLE_ADDRESSES[3]: "flyboy.eth",
    SAMPLE_ADDRESSES[4]: "nomad.eth",
    SAMPLE_ADDRESSES[5]: "wanderer.eth",
    SAMPLE_ADDRESSES[6]: "explorer.eth",
    SAMPLE_ADDRESSES[7]: "pilot.eth",
}


def load_airports_csv():
    airports = []
    with open(ROOT / "airports.csv", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            if len(row) < 7:
                continue
            code = row[5].strip()
            if code == "PASS":
                continue
            info = AIRPORTS_DB.get(code, {})
            airports.append(
                {
                    "event_id": int(row[0].strip()),
                    "title": row[3].strip(),
                    "code": code,
                    "continent": row[6].strip(),
                    "lat": info.get("lat", 0),
                    "lon": info.get("lon", 0),
                    "city": info.get("city", ""),
                    "country": info.get("country", ""),
                    "name": info.get("name", row[3].strip()),
                }
            )
    return airports


def generate_claims(airports):
    """Generate realistic-looking sample claims."""
    claims = []

    # Major hubs get more claims
    hub_codes = {"JFK", "LAX", "LHR", "CDG", "FRA", "SIN", "HND", "DXB", "ATL", "ORD", "SFO", "AMS", "FCO", "BCN", "GRU", "SYD", "HKG", "ICN"}

    for airport in airports:
        code = airport["code"]
        # Hubs get 15-40, medium airports 5-20, small 1-10
        if code in hub_codes:
            n_claims = random.randint(15, 40)
        elif airport["continent"] in ("Europe", "North America"):
            n_claims = random.randint(5, 20)
        else:
            n_claims = random.randint(1, 10)

        airport["claims"] = n_claims

        # Pick random addresses, weighted toward frequent travelers
        for _ in range(n_claims):
            # 40% chance of being a frequent traveler (top 20 addresses)
            if random.random() < 0.4:
                addr = random.choice(SAMPLE_ADDRESSES[:20])
            else:
                addr = random.choice(SAMPLE_ADDRESSES)

            month = random.randint(1, 2)
            day = random.randint(1, 28)
            hour = random.randint(0, 23)
            minute = random.randint(0, 59)

            claims.append(
                {
                    "address": addr,
                    "ens": SAMPLE_ENS.get(addr, ""),
                    "airport": code,
                    "event_id": airport["event_id"],
                    "created": f"2026-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00Z",
                    "token_id": str(random.randint(100000, 999999)),
                }
            )

    return claims


def build_leaderboards(airports, claims):
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


def main():
    print("Generating sample data...\n")

    airports = load_airports_csv()
    print(f"  {len(airports)} airports loaded")

    claims = generate_claims(airports)
    print(f"  {len(claims)} sample claims generated")

    leaderboards = build_leaderboards(airports, claims)
    print(
        f"  {len(leaderboards['addresses'])} addresses, "
        f"{len(leaderboards['airports'])} airports, "
        f"{len(leaderboards['regions'])} regions"
    )

    data_dir = ROOT / "_data"
    data_dir.mkdir(exist_ok=True)

    with open(data_dir / "airports.json", "w") as f:
        json.dump(airports, f, indent=2)

    with open(data_dir / "claims.json", "w") as f:
        json.dump(claims, f, indent=2)

    with open(data_dir / "leaderboards.json", "w") as f:
        json.dump(leaderboards, f, indent=2)

    print("\nDone! Files written to _data/")


if __name__ == "__main__":
    main()
