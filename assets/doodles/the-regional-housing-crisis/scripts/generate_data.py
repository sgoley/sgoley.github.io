#!/usr/bin/env python3
"""
Process Zillow and FHFA Home Price Index datasets to generate a consolidated
long-term annual housing return dataset (1975-2026) with Treasury yields and Mortgage rates.
"""

import csv
import json
from pathlib import Path

# File paths
BASE_DIR = Path(__file__).resolve().parents[1]
STATE_CSV_PATH = BASE_DIR / "data" / "Zillow" / "State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
METRO_CSV_PATH = BASE_DIR / "data" / "Zillow" / "Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_month.csv"
FHFA_CSV_PATH = Path("/Users/admin/Storage/Git/doodles/stlt-doodles/stlt-gfc-explorer/data/csv/fhfa_hpi_master.csv")
OUTPUT_JSON_PATH = BASE_DIR / "data" / "housing_annual_returns.json"

# Historical CPI-U (Consumer Price Index) values for December of each year, and April 2026.
# Base is 1982-1984 = 100
CPI_MAP = {
    "1975": 55.5, "1976": 58.2, "1977": 62.1, "1978": 67.7, "1979": 76.7,
    "1980": 86.3, "1981": 94.0, "1982": 98.0, "1983": 101.3, "1984": 105.3,
    "1985": 109.3, "1986": 110.5, "1987": 115.4, "1988": 120.5, "1989": 126.1,
    "1990": 133.9, "1991": 137.9, "1992": 141.9, "1993": 145.8, "1994": 149.7,
    "1995": 153.5, "1996": 158.6, "1997": 161.3, "1998": 163.9, "1999": 168.3,
    "2000": 174.0, "2001": 176.7, "2002": 180.9, "2003": 184.3, "2004": 190.3,
    "2005": 196.8, "2006": 201.8, "2007": 210.0, "2008": 210.2, "2009": 215.9,
    "2010": 219.2, "2011": 225.7, "2012": 229.6, "2013": 233.0, "2014": 234.8,
    "2015": 236.5, "2016": 241.4, "2017": 246.5, "2018": 251.2, "2019": 257.0,
    "2020": 260.5, "2021": 278.8, "2022": 296.8, "2023": 306.7, "2024": 315.6,
    "2025": 324.1, "2026": 333.0,
}

# 10-Year US Treasury yield (GS10, December monthly averages from FRED)
TREASURY_MAP = {
    "1975": 7.99, "1976": 7.61, "1977": 7.42, "1978": 8.41, "1979": 9.44,
    "1980": 11.46, "1981": 13.91, "1982": 13.00, "1983": 11.10, "1984": 12.44,
    "1985": 10.62, "1986": 7.68, "1987": 8.39, "1988": 8.85, "1989": 8.50,
    "1990": 8.55, "1991": 7.86, "1992": 7.01, "1993": 5.87, "1994": 7.09,
    "1995": 6.57, "1996": 6.44, "1997": 6.35, "1998": 5.26, "1999": 5.65,
    "2000": 6.03, "2001": 5.02, "2002": 4.61, "2003": 4.01, "2004": 4.27,
    "2005": 4.29, "2006": 4.79, "2007": 4.63, "2008": 3.67, "2009": 3.26,
    "2010": 3.22, "2011": 2.78, "2012": 1.80, "2013": 2.35, "2014": 2.54,
    "2015": 2.14, "2016": 1.84, "2017": 2.33, "2018": 2.91, "2019": 2.14,
    "2020": 0.89, "2021": 1.45, "2022": 2.95, "2023": 3.96, "2024": 4.07,
    "2025": 4.40, "2026": 4.31
}

# 30-Year Fixed Rate Mortgage average (MORTGAGE30US annual averages from Freddie Mac / FRED)
MORTGAGE_MAP = {
    "1975": 9.05, "1976": 8.87, "1977": 8.85, "1978": 9.64, "1979": 11.20,
    "1980": 13.74, "1981": 16.64, "1982": 16.04, "1983": 13.24, "1984": 13.88,
    "1985": 12.43, "1986": 10.19, "1987": 10.21, "1988": 10.34, "1989": 10.32,
    "1990": 10.13, "1991": 9.25, "1992": 8.39, "1993": 7.31, "1994": 8.38,
    "1995": 7.93, "1996": 7.81, "1997": 7.60, "1998": 6.94, "1999": 7.44,
    "2000": 8.05, "2001": 6.97, "2002": 6.54, "2003": 5.83, "2004": 5.84,
    "2005": 5.87, "2006": 6.41, "2007": 6.34, "2008": 6.03, "2009": 5.04,
    "2010": 4.69, "2011": 4.45, "2012": 3.66, "2013": 3.98, "2014": 4.17,
    "2015": 3.85, "2016": 3.65, "2017": 3.99, "2018": 4.54, "2019": 3.94,
    "2020": 3.11, "2021": 2.96, "2022": 5.34, "2023": 6.81, "2024": 6.79,
    "2025": 6.66, "2026": 6.50
}

YEARS = sorted(list(CPI_MAP.keys()))
DATE_COLS = [f"{y}-12-31" if y != "2026" else "2026-04-30" for y in YEARS]

# Splicing years: 1975 to 1999 from FHFA, 2000 to 2026 from Zillow
HISTORICAL_YEARS = [str(y) for y in range(1975, 2000)]
ZILLOW_YEARS = [str(y) for y in range(2000, 2027)]

def load_fhfa_historical():
    """Load FHFA Q4 HPI values (1975-2000) for USA and States."""
    fhfa_data = {}
    if not FHFA_CSV_PATH.exists():
        print(f"Warning: FHFA HPI Master not found at {FHFA_CSV_PATH}")
        return fhfa_data
        
    with open(FHFA_CSV_PATH, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r["hpi_flavor"] == "all-transactions" and r["frequency"] == "quarterly" and r["period"] == "4":
                level = r["level"]
                name = r["place_name"]
                yr = r["yr"]
                
                if level in ("State", "USA or Census Division"):
                    key = name.lower()
                    if key not in fhfa_data:
                        fhfa_data[key] = {}
                    try:
                        fhfa_data[key][yr] = float(r["index_nsa"])
                    except ValueError:
                        pass
    return fhfa_data

def process_csv(zillow_path, region_type, fhfa_data):
    """Parse Zillow CSV and splice with FHFA historical data where available."""
    if not zillow_path.exists():
        print(f"Warning: Zillow file not found {zillow_path}")
        return []
        
    extracted_regions = []
    
    with open(zillow_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        headers = next(reader)
        
        name_idx = headers.index("RegionName")
        rank_idx = headers.index("SizeRank")
        state_idx = headers.index("StateName") if "StateName" in headers else -1
        
        # Pre-cache date column indices for Zillow years (2000-2026)
        zillow_col_indices = []
        for y in ZILLOW_YEARS:
            col_name = f"{y}-12-31" if y != "2026" else "2026-04-30"
            if col_name in headers:
                zillow_col_indices.append(headers.index(col_name))
            else:
                zillow_col_indices.append(-1)
                
        for row in reader:
            if not row:
                continue
                
            name = row[name_idx]
            rank = int(row[rank_idx]) if row[rank_idx] and row[rank_idx].strip() != "" else 99999
            state = row[state_idx] if state_idx != -1 else ""
            
            if region_type == "national" and name != "United States":
                continue
            if region_type == "metro" and name == "United States":
                r_type = "national"
            else:
                r_type = region_type
                
            # Extract Zillow values (2000-2026)
            z_vals = []
            incomplete = False
            for idx in zillow_col_indices:
                if idx == -1 or idx >= len(row):
                    incomplete = True
                    break
                val_str = row[idx].strip()
                if not val_str:
                    incomplete = True
                    break
                try:
                    z_vals.append(float(val_str))
                except ValueError:
                    incomplete = True
                    break
                    
            if incomplete:
                continue
                
            # Check for historical FHFA data for splicing (National & States only)
            fhfa_key = name.lower()
            values = []
            
            if (r_type in ("national", "state")) and (fhfa_key in fhfa_data):
                fhfa_years_map = fhfa_data[fhfa_key]
                if "2000" in fhfa_years_map:
                    f_2000 = fhfa_years_map["2000"]
                    z_2000 = z_vals[0]
                    scale_factor = z_2000 / f_2000
                    
                    has_all_hist = True
                    hist_vals = []
                    for y in HISTORICAL_YEARS:
                        if y in fhfa_years_map:
                            hist_vals.append(fhfa_years_map[y] * scale_factor)
                        else:
                            has_all_hist = False
                            break
                            
                    if has_all_hist:
                        values = hist_vals + z_vals
                    else:
                        values = [None] * len(HISTORICAL_YEARS) + z_vals
                else:
                    values = [None] * len(HISTORICAL_YEARS) + z_vals
            else:
                values = [None] * len(HISTORICAL_YEARS) + z_vals
                
            extracted_regions.append({
                "key": f"{r_type}_{name.lower().replace(', ', '_').replace(' ', '_')}",
                "name": name,
                "state": state,
                "type": r_type,
                "sizeRank": rank,
                "values": values
            })
            
    return extracted_regions

def main():
    print("Loading FHFA historical indices (1975-2000)...")
    fhfa_data = load_fhfa_historical()
    
    print("Processing Zillow datasets & splicing...")
    all_regions = []
    
    metro_regions = process_csv(METRO_CSV_PATH, "metro", fhfa_data)
    all_regions.extend(metro_regions)
    
    state_regions = process_csv(STATE_CSV_PATH, "state", fhfa_data)
    all_regions.extend(state_regions)
    
    # Sort regions
    def sort_key(r):
        type_order = {"national": 0, "state": 1, "metro": 2}
        return (type_order[r["type"]], r["sizeRank"], r["name"])
    all_regions.sort(key=sort_key)
    
    # Structure output
    payload = {
        "source": "Zillow Home Value Index (ZHVI) smoothed, seasonally adjusted; FHFA HPI Master (all-transactions quarterly Q4 index); CPI-U from BLS; FRED DGS10/MORTGAGE30US",
        "description": "Annual spliced home values, 10-year Treasury yields, 30-year fixed mortgage rates, and CPI-U index values (1975-2026) for U.S. national, states, and metro areas.",
        "startYear": int(YEARS[0]),
        "endYear": int(YEARS[-1]),
        "years": [int(y) for y in YEARS],
        "cpi": [CPI_MAP[y] for y in YEARS],
        "treasury_yields": [TREASURY_MAP[y] for y in YEARS],
        "mortgage_rates": [MORTGAGE_MAP[y] for y in YEARS],
        "regions": all_regions
    }
    
    # Ensure output folder exists
    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        
    print(f"Successfully wrote {len(all_regions)} regions to {OUTPUT_JSON_PATH}")

if __name__ == "__main__":
    main()
