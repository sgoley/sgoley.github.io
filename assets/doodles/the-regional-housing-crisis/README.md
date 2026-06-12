# The Regional Housing Crisis (1975–2026)

An interactive, high-fidelity data visualization project modeled in a similar fashion as the "Investing Start/Finish" visual. It allows users to select any state or one of 500+ metro areas to inspect start-year and end-year annualized housing returns (CAGR) from **1975 to 2026** (or 2000+ for metro areas).

The visualization enables users to explore regional housing bubbles, GFC-era price drops, post-crisis recoveries, the COVID-19 housing boom, and the current fragile housing landscape of 2026.

---

## Features

- **Start-Year / End-Year Heatmap**: A matrix rendering annualized return (CAGR) for every purchase-year and sale-year combination from 2000 to 2026.
- **Inflation Toggle**: Instantly switch between **Nominal Returns** and **Inflation-Adjusted Real Returns** utilizing the historical U.S. Consumer Price Index (CPI-U).
- **Search Dropdown**: Autocomplete combobox to search and select from **47 States** and **503 Metro Areas** with complete data records.
- **Quick Presets**: Fast-access tabs for quick comparisons between the United States, California, Florida, Nevada, and Texas.
- **Dynamic Cycle Stats**:
  - **GFC Crash**: Calculates the local peak-to-trough decline (typically between 2006–2012) for the active region.
  - **COVID Boom to 2026**: Evaluates growth since 2019.
  - **Best/Worst 5-Year Windows**: Locates the most extreme 5-year periods in the region's dataset.

---

## How to Run

1. Navigate to the project directory:
   ```bash
   cd /Users/admin/Storage/Git/doodles/the-regional-housing-crisis
   ```

2. Start a local HTTP server:
   ```bash
   python3 -m http.server 8000
   ```

3. Open your browser and navigate to:
   [http://localhost:8000](http://localhost:8000)

---

## Data Sources

The visual is backed by processed annual datasets in `data/housing_annual_returns.json` compiled from:
- **Zillow Home Value Index (ZHVI)**: Smoothed, seasonally adjusted home values for mid-tier single-family residences and condos.
  - State file: `data/Zillow/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`
  - Metro file: `data/Zillow/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_month.csv`
- **Consumer Price Index (CPI-U)**: Consumer Price Index for All Urban Consumers (U.S. city average, All items, 1982-1984 = 100) from the Bureau of Labor Statistics (BLS).

---

## Optional: Regenerating the Data

If you need to re-compile or customize the data points, run the data compiler script:

```bash
python3 scripts/generate_data.py
```

This script parses Zillow's monthly CSV files, extracts December prices for 2000–2025 (and April 2026 prices to capture the current state), aligns them with the CPI-U map, filters for regions with complete data, and formats them into the JSON payload.

---

## Directory Structure

```
the-regional-housing-crisis/
├── index.html            # Core frontend layout and components
├── styles.css            # Custom premium editorial CSS styling
├── app.js                # Frontend data mapping, canvas renderer, & interactions
├── README.md             # This document
├── data/
│   ├── Zillow/           # Raw Zillow CSV files
│   ├── housing_annual_returns.json  # Processed JSON output
│   └── ...
└── scripts/
    └── generate_data.py  # Python data compiler and parser
```
