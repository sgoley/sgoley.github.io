#!/usr/bin/env python3
"""
Compile ZIP code level GFC crash data and demographics for major US cities.
Generates data/zip_variance.json.
"""

import csv
import json
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parents[1]
EXTRACTED_CSV_PATH = BASE_DIR / "data" / "extracted_data.csv"
USZIPS_CSV_PATH = BASE_DIR / "data" / "uszips.csv"
OUTPUT_JSON_PATH = BASE_DIR / "data" / "zip_variance.json"

def main():
    print("Loading ZIP metadata from uszips.csv...")
    uszips = {}
    if USZIPS_CSV_PATH.exists():
        with open(USZIPS_CSV_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                zip5 = r["zip"].zfill(5)
                uszips[zip5] = {
                    "lat": float(r["lat"]) if r["lat"] else 0.0,
                    "lng": float(r["lng"]) if r["lng"] else 0.0,
                    "pop": int(r["population"]) if r["population"] else 0,
                    "density": float(r["density"]) if r["density"] else 0.0
                }
    else:
        print("Warning: uszips.csv not found. Continuing without zip coordinates and density.")

    print("Reading extracted_data.csv...")
    city_zips = defaultdict(list)
    
    with open(EXTRACTED_CSV_PATH, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            zip5 = r["Zip5"].zfill(5)
            city = r["city"].strip()
            state = r["state_id"].strip()
            drop_str = r["hpi_peak_to_trough_%"].replace("%", "").strip()
            
            if not city or not state or drop_str == "Infinity" or drop_str == "":
                continue
                
            try:
                drop_val = float(drop_str)
            except ValueError:
                continue
                
            zip_meta = uszips.get(zip5, {"lat": 0.0, "lng": 0.0, "pop": 0, "density": 0.0})
            
            city_zips[f"{city}, {state}"].append({
                "zip": zip5,
                "drop": drop_val,
                "peak": float(r["gfc_peak_hpi"]) if r["gfc_peak_hpi"] else 0.0,
                "trough": float(r["gfc_trough_hpi"]) if r["gfc_trough_hpi"] else 0.0,
                "pop": zip_meta["pop"],
                "density": zip_meta["density"],
                "lat": zip_meta["lat"],
                "lng": zip_meta["lng"]
            })
            
    # Filter: Keep cities with at least 3 ZIP codes to show meaningful variance
    filtered_cities = {}
    for city_state, zips in city_zips.items():
        if len(zips) >= 3:
            # Sort zipcodes in city from smallest drop (most stable) to largest drop (most crashed)
            zips.sort(key=lambda x: x["drop"], reverse=True)
            filtered_cities[city_state] = zips
            
    print(f"Compiled {len(filtered_cities)} cities with at least 3 ZIP codes.")
    
    # Save output
    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(filtered_cities, f, indent=2)
        
    print(f"Successfully wrote ZIP variance data to {OUTPUT_JSON_PATH}")

if __name__ == "__main__":
    main()
