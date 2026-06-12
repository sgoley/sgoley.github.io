---
title: Regional Housing Crisis (1975–2026)
author: Scott Goley
status: published
published: 2026-06-12
tags: [doodle, housing, economics, javascript, visualization, data]
---

# Regional Housing Crisis (1975–2026)

A follow-up to the [Investing Start/Finish](proj-investing-start-finish.html) heatmap doodle — this one zooms in on the U.S. housing market specifically, letting you compare purchase-year vs. sale-year annualized returns from **1975 through 2026** for every U.S. state and 500+ metro areas.

## Demo

<style>
  /* Launch bar that sits above the iframe */
  .embed-launch-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.62rem 1rem;
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    margin-top: 1rem;
  }

  .embed-launch-bar span {
    font-size: 0.82rem;
    color: var(--muted);
  }

  .embed-launch-bar a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--line-strong);
    background: var(--accent-bg);
    color: var(--accent-2);
    border-radius: 999px;
    padding: 0.35rem 0.82rem;
    font-size: 0.82rem;
    font-weight: 600;
    transition: 120ms ease;
    text-decoration: none;
  }

  .embed-launch-bar a:hover {
    background: var(--accent);
    color: #fff;
    text-decoration: none;
  }

  .embed-frame-wrap-housing {
    margin: 0;
  }

  .embed-frame-housing {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 0 0 16px 16px;
    background: var(--surface);
    display: block;
  }
</style>

<div class="embed-launch-bar">
  <span>Interactive demo — best experienced at full width</span>
  <a href="/assets/doodles/the-regional-housing-crisis/" target="_blank" rel="noopener">
    ↗ Open full page
  </a>
</div>
<div class="embed-frame-wrap-housing">
  <iframe
    class="embed-frame-housing"
    src="/assets/doodles/the-regional-housing-crisis/"
    title="Regional Housing Crisis 1975–2026 live demo"
    loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen
    style="height: 1100px;"
  ></iframe>
</div>

If your browser blocks embeds, open it directly: [Open live demo](/assets/doodles/the-regional-housing-crisis/)

## What it shows

The primary view is a **holding-period heatmap**: each cell represents the annualized (CAGR) return for a home purchased in the row-year and sold in the column-year. Deep red signals losses, cream is flat, greens are gains. You can immediately spot the GFC crater (2006–2012), the COVID rocket (2019–2022), and the post-pandemic plateau we're navigating now.

Below the heatmap is a paired sub-graph of the **30-year fixed mortgage rate** (red) and **10-year Treasury yield** (blue) since 1975 — the secular decline in both rates was a major structural tailwind for home prices over five decades, and its reversal since 2022 explains much of the "frozen" market we're in today.

## Why 2026 is not 2008

Many observers look at elevated 2026 prices and worry about a repeat of the subprime meltdown. The **Economics & Credit** tab makes the structural counter-argument:

- **Supply is genuinely constrained.** Post-2008 construction never recovered to meet demographic demand. The U.S. is millions of units short — a structural floor that didn't exist pre-GFC.
- **Mortgage quality is radically different.** Post-Dodd-Frank underwriting eliminated most exotic products. Today's homeowners skew high-credit-score, fixed-rate, and locked into sub-4% mortgages they have no incentive to walk away from.
- **The "lock-in effect" suppresses supply.** Rather than a wave of distressed selling, restricted inventory keeps prices elevated even as affordability deteriorates.

The risk today isn't a 2008-style systemic default cascade — it's a prolonged, grinding affordability crisis for non-homeowners, with prices high and sticky rather than collapsing.

## Data sources

- **Zillow Home Value Index (ZHVI)** — smoothed, seasonally adjusted mid-tier values, 2000–2026
- **FHFA HPI all-transactions index** — quarterly Q4 values spliced back to 1975 for states & national
- **BLS CPI-U** — for real (inflation-adjusted) return toggle
- **FRED DGS10 / MORTGAGE30US** — 10-year Treasury yield and 30-year fixed mortgage rate

The FHFA and Zillow series are spliced at year-2000 using a scale factor so national and state series extend continuously from 1975; metro areas begin in 2000 where Zillow data starts.

## Commentary

This started as a curiosity: the original [Start/Finish doodle](proj-investing-start-finish.html) covered equity indices. I wanted the same matrix view for housing, but with regional granularity — because housing crises are deeply geographic. Nevada and Florida cratered 50%+ during the GFC while Texas barely dipped. Today's hot markets (Austin, Tampa, Phoenix) look very different from coastal supply-constrained cores (NYC, Boston, SF).

The most interesting visual is the "twin peaks" tab — some cities show a classic GFC double-peak shape (La Vegas, Miami) while others (San Francisco, Seattle) were resilient in 2008 but experienced an even steeper post-pandemic surge. Both patterns converge on the same 2026 plateau, but from very different trajectories.
