# Investing Start/Finish Visual (1928–2025)

Simple localhost app that recreates a NYT-style “when you start and when you finish” investment heatmap and extends it through 2025, with two tabs:

- S&P 500 (inflation-adjusted real return)
- Gold (nominal per-ounce price return)

## Run

```bash
cd /Users/admin/Storage/Git/doodles/investing-start-finish
python3 -m http.server 8000
```

Then open: <http://localhost:8000>

## Data

`data/annual_returns.json` is generated from Aswath Damodaran's historical returns dataset:

- Source workbook: `https://www.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xlsx`
- S&P 500 total return (includes dividends), gold annual return, annual inflation, and calculated real return variants:
  - `sp500_real = (1 + sp500_nominal) / (1 + inflation) - 1`
  - `gold_real = (1 + gold_nominal) / (1 + inflation) - 1` (included in data, not currently the gold tab metric)

## Optional: regenerate data

```bash
cd /Users/admin/Storage/Git/doodles/investing-start-finish
python3 -m venv .venv
. .venv/bin/activate
pip install openpyxl
python scripts/generate_data.py
```

## Notes

- S&P tab uses inflation-adjusted annual returns through 2025.
- Gold tab uses nominal annual per-ounce return through 2025.
- It does **not** include taxes/fees drag from the original NYT chart.
