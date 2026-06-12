// app.js - Logic for housing return visualizer dashboard

// Global variables
let payload = null;          // Loaded from housing_annual_returns.json
let zipVarianceData = null;  // Loaded from zip_variance.json
let activeRegion = null;     // Selected region in Heatmap tab
let isInflationAdjusted = false;

// Selected city for within-city variance
let activeVarianceCity = "Orlando, FL";

// Selected sorting key in Twin Peaks tab
let activeTwinPeaksSort = "gfc"; // "gfc" or "growth"
let selectedTwinPeaksMetro = null; // Key of selected row in Twin Peaks tab

// DOM Elements - Heatmap Tab
const canvasHeatmap = document.getElementById("chart");
const ctxHeatmap = canvasHeatmap.getContext("2d");
const tooltipHeatmap = document.getElementById("tooltip");
const regionSearchEl = document.getElementById("region-search");
const clearSearchEl = document.getElementById("clear-search");
const searchDropdownEl = document.getElementById("search-dropdown");
const inflationToggleEl = document.getElementById("inflation-toggle");
const legendTitleEl = document.getElementById("legendTitle");
const legendTicksEl = document.getElementById("legendTicks");

// DOM Elements - Stats
const gfcCrashEl = document.getElementById("gfc-crash");
const covidBoomEl = document.getElementById("covid-boom");
const worst5YrEl = document.getElementById("worst-5yr");
const best5YrEl = document.getElementById("best-5yr");

// DOM Elements - Navigation Tabs
const navTabs = document.querySelectorAll(".nav-tab");
const tabContents = document.querySelectorAll(".tab-content");

// DOM Elements - Twin Peaks Tab
const sparklineTableBody = document.getElementById("sparkline-table-body");
const sortGfcBtn = document.getElementById("sort-gfc");
const sortGrowthBtn = document.getElementById("sort-growth");
const trendDetailsContent = document.getElementById("trend-details-content");

// DOM Elements - Within-City Variance Tab
const cityVarianceSearchEl = document.getElementById("city-variance-search");
const clearVarianceSearchEl = document.getElementById("clear-variance-search");
const varianceDropdownEl = document.getElementById("variance-dropdown");
const zipBarChartEl = document.getElementById("zip-bar-chart");
const densityStatTextEl = document.getElementById("density-stat-text");
const scatterCanvas = document.getElementById("scatter-chart");
const ctxScatter = scatterCanvas.getContext("2d");
const scatterTooltip = document.getElementById("scatter-tooltip");

// Color stops for heatmap
const COLOR_STOPS = [
  { value: -0.10, color: "#8c3f3f" }, // Deep red
  { value: -0.05, color: "#b85a5a" }, // Muted red
  { value: 0.00,  color: "#ebdcd0" }, // Cream/neutral
  { value: 0.03,  color: "#d5e2c1" }, // Soft light green
  { value: 0.07,  color: "#8d9f63" }, // Muted green
  { value: 0.12,  color: "#315f32" }  // Dark green
];

const HeatmapMargin = { top: 74, right: 24, bottom: 24, left: 74 };
const HeatmapPresets = {
  "preset-us": "national_united_states",
  "preset-ca": "state_california",
  "preset-fl": "state_florida",
  "preset-nv": "state_nevada",
  "preset-tx": "state_texas"
};

// ==========================================
// COMMON HELPERS
// ==========================================
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolateColor(stops, value) {
  if (value <= stops[0].value) return stops[0].color;
  if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      return rgbToHex({
        r: lerp(ca.r, cb.r, t),
        g: lerp(ca.g, cb.g, t),
        b: lerp(ca.b, cb.b, t)
      });
    }
  }
  return stops[stops.length - 1].color;
}

function pct(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

// Calculate GFC drop percentage and years
function calculateGfcCrash(years, values) {
  let peakIdx = -1;
  let peakVal = -1;
  for (let idx = 0; idx < years.length; idx++) {
    const y = years[idx];
    if (y >= 2005 && y <= 2008) {
      if (values[idx] > peakVal) {
        peakVal = values[idx];
        peakIdx = idx;
      }
    }
  }
  
  let troughVal = Infinity;
  let troughIdx = -1;
  if (peakIdx !== -1) {
    for (let idx = peakIdx; idx < years.length; idx++) {
      const y = years[idx];
      if (y <= 2014) {
        if (values[idx] < troughVal) {
          troughVal = values[idx];
          troughIdx = idx;
        }
      }
    }
  }
  
  if (peakIdx !== -1 && troughIdx !== -1 && troughVal < peakVal) {
    const dropPct = ((troughVal - peakVal) / peakVal) * 100;
    return {
      peakYear: years[peakIdx],
      troughYear: years[troughIdx],
      peakVal: peakVal,
      troughVal: troughVal,
      dropPct: dropPct
    };
  }
  return null;
}

// ==========================================
// TAB ROUTING
// ==========================================
function initNavigation() {
  navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // Deactivate all tabs
      navTabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tabContents.forEach(tc => {
        tc.classList.remove("active");
      });
      
      // Activate clicked tab
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const targetId = tab.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
      
      // Initialize tab-specific views
      if (targetId === "heatmap-tab") {
        renderHeatmap(activeRegion);
      } else if (targetId === "twinpeaks-tab") {
        renderTwinPeaks();
      } else if (targetId === "variance-tab") {
        renderVariance();
      }
    });
  });
}

// ==========================================
// THEME TOGGLE
// ==========================================
function initThemeToggle() {
  const root = document.documentElement;
  const themeKey = "housing-doodle-theme";
  const toggleBtn = document.getElementById("theme-toggle");
  if (!toggleBtn) return;

  const readTheme = () => {
    try { return localStorage.getItem(themeKey); } catch { return null; }
  };
  const writeTheme = (t) => {
    try { localStorage.setItem(themeKey, t); } catch { /* noop */ }
  };

  const applyTheme = (theme) => {
    const normalized = theme === "light" ? "light" : "dark";
    root.dataset.theme = normalized;
    const icon = toggleBtn.querySelector(".theme-toggle-icon");
    const label = toggleBtn.querySelector(".theme-toggle-label");
    const nextTheme = normalized === "dark" ? "light" : "dark";
    if (icon) icon.textContent = normalized === "dark" ? "☾" : "☀";
    if (label) label.textContent = `Switch to ${nextTheme} mode`;
    toggleBtn.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    toggleBtn.setAttribute("title", `Switch to ${nextTheme} mode`);
  };

  const saved = readTheme();
  const hasSaved = saved === "dark" || saved === "light";
  const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const preferred = prefersDark ? "dark" : "light";
  applyTheme(hasSaved ? saved : preferred);

  toggleBtn.addEventListener("click", () => {
    const current = root.dataset.theme === "light" ? "light" : "dark";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    writeTheme(next);
    // Re-render canvas so colors update immediately
    if (activeRegion) requestAnimationFrame(() => renderHeatmap(activeRegion));
  });
}

// ==========================================
// TAB 1: HEATMAP MATRIX
// ==========================================
function buildMatrix(region, adjustInflation) {
  const years = payload.years;
  const cpi = payload.cpi;
  const rawValues = region.values;
  
  // Find first index where value is not null (for dynamic time scaling)
  const firstIdx = rawValues.findIndex(v => v !== null);
  if (firstIdx === -1) return { matrixYears: [], intervals: [] };
  
  const validYears = years.slice(firstIdx);
  const validCPI = cpi.slice(firstIdx);
  const validRawValues = rawValues.slice(firstIdx);
  
  const values = validRawValues.map((v, idx) => {
    return adjustInflation ? (v / validCPI[idx]) * validCPI[validCPI.length - 1] : v;
  });
  
  const intervals = [];
  const matrixYears = validYears.slice(1);
  
  for (let i = 0; i < matrixYears.length; i++) {
    const startYear = matrixYears[i];
    const startVal = values[i]; // Dec of Year-1
    const rawStartVal = validRawValues[i];
    
    for (let j = i; j < matrixYears.length; j++) {
      const endYear = matrixYears[j];
      const endVal = values[j + 1];
      const rawEndVal = validRawValues[j + 1];
      
      let yearsHeld = j - i + 1;
      if (endYear === 2026) {
        yearsHeld = (2025 - (startYear - 1)) + 0.3333;
      }
      
      const totalGrowth = endVal / startVal;
      const cagr = Math.pow(totalGrowth, 1 / yearsHeld) - 1;
      
      intervals.push({
        startIdx: i,
        endIdx: j,
        startYear: startYear - 1,
        endYear: endYear,
        yearsHeld: yearsHeld,
        cagr: cagr,
        rawStartVal: rawStartVal,
        rawEndVal: rawEndVal
      });
    }
  }
  
  return { matrixYears, intervals };
}

function updateHeatmapStats(region, adjustInflation) {
  const years = payload.years;
  const rawValues = region.values;
  const cpi = payload.cpi;
  
  // Find first index where value is not null
  const firstIdx = rawValues.findIndex(v => v !== null);
  if (firstIdx === -1) return;
  
  const validYears = years.slice(firstIdx);
  const validRawValues = rawValues.slice(firstIdx);
  const validCPI = cpi.slice(firstIdx);
  
  const values = validRawValues.map((v, idx) => {
    return adjustInflation ? (v / validCPI[idx]) * validCPI[validCPI.length - 1] : v;
  });
  
  // 1. GFC Crash
  const gfc = calculateGfcCrash(validYears, values);
  if (gfc) {
    gfcCrashEl.innerHTML = `
      <strong>${gfc.peakYear} → ${gfc.troughYear}</strong>: 
      <span class="return-val negative">${gfc.dropPct.toFixed(1)}%</span><br />
      <span style="font-size: 11px; color: var(--muted); font-weight: normal;">
        (${formatCurrency(validRawValues[validYears.indexOf(gfc.peakYear)])} to ${formatCurrency(validRawValues[validYears.indexOf(gfc.troughYear)])})
      </span>
    `;
  } else {
    gfcCrashEl.innerHTML = `<em>No significant GFC decline</em>`;
  }
  
  // 2. COVID Boom to 2026
  const idx2019 = validYears.indexOf(2019);
  const idx2026 = validYears.indexOf(2026);
  if (idx2019 !== -1 && idx2026 !== -1) {
    const val2019 = values[idx2019];
    const val2026 = values[idx2026];
    const rawVal2019 = rawValues[idx2019];
    const rawVal2026 = rawValues[idx2026];
    const boomPct = ((val2026 - val2019) / val2019) * 100;
    const colorClass = boomPct > 0 ? "positive" : "negative";
    
    covidBoomEl.innerHTML = `
      <strong>2019 → 2026</strong>: 
      <span class="return-val ${colorClass}">${pct(boomPct/100)}</span><br />
      <span style="font-size: 11px; color: var(--muted); font-weight: normal;">
        (${formatCurrency(rawVal2019)} to ${formatCurrency(rawVal2026)})
      </span>
    `;
  } else {
    covidBoomEl.innerHTML = `<em>Data unavailable</em>`;
  }
  
  // Best/Worst 5-Year Windows
  const matrixData = buildMatrix(region, adjustInflation);
  const fiveYrPeriods = matrixData.intervals.filter(d => Math.abs(d.yearsHeld - 5.0) < 0.2);
  
  if (fiveYrPeriods.length > 0) {
    fiveYrPeriods.sort((a, b) => a.cagr - b.cagr);
    const worst = fiveYrPeriods[0];
    const best = fiveYrPeriods[fiveYrPeriods.length - 1];
    
    worst5YrEl.innerHTML = `
      <strong>${worst.startYear} → ${worst.endYear}</strong>: 
      <span class="return-val negative">${pct(worst.cagr)} / yr</span>
    `;
    
    best5YrEl.innerHTML = `
      <strong>${best.startYear} → ${best.endYear}</strong>: 
      <span class="return-val positive">${pct(best.cagr)} / yr</span>
    `;
  } else {
    worst5YrEl.innerHTML = `<em>N/A</em>`;
    best5YrEl.innerHTML = `<em>N/A</em>`;
  }
}

function setupHeatmapPointer(matrixYears, intervals, cell, validTreasury, validMortgage) {
  const count = matrixYears.length;
  const drawW = count * cell;
  const drawH = count * cell;
  
  const intervalsByCell = new Map();
  for (const item of intervals) {
    intervalsByCell.set(`${item.startIdx}:${item.endIdx}`, item);
  }
  
  canvasHeatmap.onmousemove = (event) => {
    const rect = canvasHeatmap.getBoundingClientRect();
    const scaleX = canvasHeatmap.width / rect.width;
    const scaleY = canvasHeatmap.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    
    const localX = x - HeatmapMargin.left;
    const localY = y - HeatmapMargin.top;
    
    if (localX < 0 || localY < 0 || localX > drawW || localY > drawH) {
      tooltipHeatmap.hidden = true;
      return;
    }
    
    const endIdx = Math.floor(localX / cell);
    const startIdx = Math.floor(localY / cell);
    
    if (
      startIdx < 0 ||
      endIdx < 0 ||
      startIdx >= matrixYears.length ||
      endIdx >= matrixYears.length ||
      endIdx < startIdx
    ) {
      tooltipHeatmap.hidden = true;
      return;
    }
    
    const interval = intervalsByCell.get(`${startIdx}:${endIdx}`);
    if (!interval) {
      tooltipHeatmap.hidden = true;
      return;
    }
    
    // Look up Treasury & Mortgage yields
    const rateBuyT = validTreasury[startIdx];
    const rateSellT = validTreasury[endIdx + 1];
    const rateBuyM = validMortgage[startIdx];
    const rateSellM = validMortgage[endIdx + 1];
    
    tooltipHeatmap.hidden = false;
    tooltipHeatmap.style.left = `${event.clientX - rect.left + 16}px`;
    tooltipHeatmap.style.top = `${event.clientY - rect.top + 16}px`;
    
    const cagrClass = interval.cagr >= 0 ? "positive" : "negative";
    const toggleLabel = isInflationAdjusted ? "Real return" : "Nominal return";
    
    tooltipHeatmap.innerHTML = `
      <strong>${interval.startYear} → ${interval.endYear}</strong>
      Holding period: ${interval.yearsHeld.toFixed(1)} years<br />
      Purchase price (ZHVI): <strong>${formatCurrency(interval.rawStartVal)}</strong><br />
      Sale price (ZHVI): <strong>${formatCurrency(interval.rawEndVal)}</strong><br />
      30-Yr Mortgage: <strong>${rateBuyM.toFixed(2)}%</strong> → <strong>${rateSellM.toFixed(2)}%</strong><br />
      10-Yr Treasury: <strong>${rateBuyT.toFixed(2)}%</strong> → <strong>${rateSellT.toFixed(2)}%</strong><br />
      ${toggleLabel}: <span class="return-val ${cagrClass}">${pct(interval.cagr)} / year</span><br />
      Total multiple: <strong>${(interval.rawEndVal / interval.rawStartVal).toFixed(2)}x</strong>
    `;
  };
  
  canvasHeatmap.onmouseleave = () => {
    tooltipHeatmap.hidden = true;
  };
}

function renderHeatmap(region) {
  if (!region) return;
  activeRegion = region;
  
  legendTitleEl.textContent = isInflationAdjusted ? "Annualized Real Return" : "Annualized Nominal Return";
  
  legendTicksEl.innerHTML = "";
  COLOR_STOPS.forEach((stop, idx) => {
    const span = document.createElement("span");
    span.textContent = idx === COLOR_STOPS.length - 1 ? `${pct(stop.value)}+` : pct(stop.value);
    legendTicksEl.appendChild(span);
  });
  
  updateHeatmapStats(region, isInflationAdjusted);
  
  // Draw Canvas Heatmap and Interest Rate Sub-Graph
  const { matrixYears, intervals } = buildMatrix(region, isInflationAdjusted);
  const count = matrixYears.length;
  if (count === 0) return;
  
  const firstIdx = region.values.findIndex(v => v !== null);
  const validTreasury = payload.treasury_yields.slice(firstIdx);
  const validMortgage = payload.mortgage_rates.slice(firstIdx);
  
  const drawW = canvasHeatmap.width - HeatmapMargin.left - HeatmapMargin.right; // 920 - 74 - 24 = 822
  const cell = Math.floor(drawW / count);
  const gridW = count * cell;
  const gridH = count * cell;
  
  // Compute theme-aware colors from CSS custom properties
  const style = getComputedStyle(document.documentElement);
  const isDark = document.documentElement.dataset.theme !== "light";
  const clrBg        = isDark ? "#0f0f12" : "#f5f6fb";   // --surface
  const clrGrid      = isDark ? "rgba(255,255,255,0.20)" : "rgba(23,25,35,0.12)"; // cell grid lines
  const clrAxis      = isDark ? "rgba(255,255,255,0.35)" : "rgba(23,25,35,0.22)"; // outer axis border
  const clrLabel     = isDark ? "#a3a3ad" : "#4d566d";   // --muted
  const clrSubBorder = isDark ? "rgba(255,255,255,0.20)" : "rgba(23,25,35,0.10)"; // sub-graph dashes
  const clrSubLabel  = isDark ? "#a3a3ad" : "#888";
  const clrSubHeader = isDark ? "#55c4ff" : "#2f6fdf";   // --accent / --accent-2

  ctxHeatmap.fillStyle = clrBg;
  ctxHeatmap.fillRect(0, 0, canvasHeatmap.width, canvasHeatmap.height);
  
  // Draw Heatmap Cells
  for (const item of intervals) {
    const x = HeatmapMargin.left + item.endIdx * cell;
    const y = HeatmapMargin.top + item.startIdx * cell;
    ctxHeatmap.fillStyle = interpolateColor(COLOR_STOPS, item.cagr);
    ctxHeatmap.fillRect(x, y, cell, cell);
  }
  
  // Grid lines
  ctxHeatmap.lineWidth = 1;
  for (let i = 0; i <= count; i++) {
    const x = HeatmapMargin.left + i * cell + 0.5;
    const y = HeatmapMargin.top + i * cell + 0.5;
    const isBorder = (i === 0 || i === count);
    
    // Vertical grid line
    ctxHeatmap.strokeStyle = isBorder ? clrAxis : clrGrid;
    ctxHeatmap.beginPath();
    ctxHeatmap.moveTo(x, HeatmapMargin.top);
    ctxHeatmap.lineTo(x, HeatmapMargin.top + gridH);
    ctxHeatmap.stroke();
    
    // Horizontal grid line
    ctxHeatmap.strokeStyle = isBorder ? clrAxis : clrGrid;
    ctxHeatmap.beginPath();
    ctxHeatmap.moveTo(HeatmapMargin.left, y);
    ctxHeatmap.lineTo(HeatmapMargin.left + gridW, y);
    ctxHeatmap.stroke();
  }
  
  // Year labels (X Axis - top)
  ctxHeatmap.fillStyle = clrLabel;
  ctxHeatmap.font = "12px 'Avenir Next', Avenir, sans-serif";
  const step = count > 30 ? 5 : 5;
  
  ctxHeatmap.textAlign = "center";
  ctxHeatmap.textBaseline = "bottom";
  for (let i = 0; i < count; i += step) {
    const x = HeatmapMargin.left + i * cell + (cell / 2);
    ctxHeatmap.fillText(String(matrixYears[i]), x, HeatmapMargin.top - 8);
  }
  ctxHeatmap.fillText(String(matrixYears[count - 1]), HeatmapMargin.left + (count - 1) * cell + (cell / 2), HeatmapMargin.top - 8);
  
  // Year labels (Y Axis - left)
  ctxHeatmap.textAlign = "right";
  ctxHeatmap.textBaseline = "middle";
  ctxHeatmap.fillStyle = clrLabel;
  for (let i = 0; i < count; i += step) {
    const y = HeatmapMargin.top + i * cell + (cell / 2);
    ctxHeatmap.fillText(String(matrixYears[i]), HeatmapMargin.left - 8, y);
  }
  ctxHeatmap.fillText(String(matrixYears[count - 1]), HeatmapMargin.left - 8, HeatmapMargin.top + (count - 1) * cell + (cell / 2));
  
  // ==========================================
  // DRAW TREASURY & MORTGAGE SUB-GRAPH (AT BOTTOM)
  // ==========================================
  const subGraphTop = 930;
  const subGraphBottom = 995;
  const subGraphHeight = subGraphBottom - subGraphTop;
  
  // Draw Sub-graph header
  ctxHeatmap.fillStyle = clrSubHeader;
  ctxHeatmap.font = "bold 11px 'Avenir Next', Avenir, sans-serif";
  ctxHeatmap.textAlign = "left";
  ctxHeatmap.textBaseline = "bottom";
  ctxHeatmap.fillText("CREDIT CONTEXT: 30-YR FIXED MORTGAGE (RED) vs. 10-YR TREASURY YIELD (GOLD)", HeatmapMargin.left, subGraphTop - 12);
  
  // Draw dashed baseline and grid lines at 5%, 10%, 15% (scaled to max 18%)
  ctxHeatmap.strokeStyle = clrSubBorder;
  ctxHeatmap.lineWidth = 1;
  ctxHeatmap.setLineDash([4, 4]);
  
  const gridYields = [5, 10, 15];
  gridYields.forEach(yVal => {
    const y = subGraphBottom - (yVal / 18) * subGraphHeight;
    ctxHeatmap.beginPath();
    ctxHeatmap.moveTo(HeatmapMargin.left, y);
    ctxHeatmap.lineTo(HeatmapMargin.left + gridW, y);
    ctxHeatmap.stroke();
    
    ctxHeatmap.fillStyle = clrSubLabel;
    ctxHeatmap.font = "9px 'Avenir Next', Avenir, sans-serif";
    ctxHeatmap.textAlign = "right";
    ctxHeatmap.textBaseline = "middle";
    ctxHeatmap.fillText(`${yVal}%`, HeatmapMargin.left - 8, y);
  });
  ctxHeatmap.setLineDash([]); // Reset
  
  // Draw bottom baseline (0%)
  ctxHeatmap.strokeStyle = clrAxis;
  ctxHeatmap.lineWidth = 1;
  ctxHeatmap.beginPath();
  ctxHeatmap.moveTo(HeatmapMargin.left, subGraphBottom);
  ctxHeatmap.lineTo(HeatmapMargin.left + gridW, subGraphBottom);
  ctxHeatmap.stroke();
  
  // Map points for both lines
  const pointsT = []; // Treasury
  const pointsM = []; // Mortgage
  for (let k = 0; k < count; k++) {
    const rateT = validTreasury[k + 1];
    const rateM = validMortgage[k + 1];
    const x = HeatmapMargin.left + k * cell + (cell / 2);
    
    const yT = subGraphBottom - (rateT / 18) * subGraphHeight;
    const yM = subGraphBottom - (rateM / 18) * subGraphHeight;
    
    pointsT.push({ x, y: yT });
    pointsM.push({ x, y: yM });
  }
  
  // Draw Area fill under 30-Yr Mortgage Rate curve (the higher curve)
  ctxHeatmap.beginPath();
  ctxHeatmap.moveTo(pointsM[0].x, subGraphBottom);
  pointsM.forEach(p => ctxHeatmap.lineTo(p.x, p.y));
  ctxHeatmap.lineTo(pointsM[pointsM.length - 1].x, subGraphBottom);
  ctxHeatmap.closePath();
  
  const subGrad = ctxHeatmap.createLinearGradient(0, subGraphTop, 0, subGraphBottom);
  const mortFill = isDark ? "rgba(227, 136, 136, 0.14)" : "rgba(156, 74, 74, 0.12)";
  subGrad.addColorStop(0, mortFill);
  subGrad.addColorStop(1, "rgba(156, 74, 74, 0.0)");
  ctxHeatmap.fillStyle = subGrad;
  ctxHeatmap.fill();
  
  // Draw 10-Yr Treasury Line (accent-2 / cyan in dark, gold in light)
  ctxHeatmap.beginPath();
  ctxHeatmap.moveTo(pointsT[0].x, pointsT[0].y);
  pointsT.forEach(p => ctxHeatmap.lineTo(p.x, p.y));
  ctxHeatmap.strokeStyle = isDark ? "#55c4ff" : "#d4a373";
  ctxHeatmap.lineWidth = 1.5;
  ctxHeatmap.stroke();
  
  // Draw dots for Treasury line
  const dotColorT = isDark ? "#55c4ff" : "#a87a4e";
  pointsT.forEach(p => {
    ctxHeatmap.beginPath();
    ctxHeatmap.arc(p.x, p.y, 2, 0, 2 * Math.PI);
    ctxHeatmap.fillStyle = dotColorT;
    ctxHeatmap.fill();
  });
  
  // Draw 30-Yr Mortgage Line (red/danger)
  ctxHeatmap.beginPath();
  ctxHeatmap.moveTo(pointsM[0].x, pointsM[0].y);
  pointsM.forEach(p => ctxHeatmap.lineTo(p.x, p.y));
  ctxHeatmap.strokeStyle = isDark ? "#e38888" : "#9c4a4a";
  ctxHeatmap.lineWidth = 2.2;
  ctxHeatmap.stroke();

  // Draw dots for Mortgage line
  const dotColorM = isDark ? "#e38888" : "#9c4a4a";
  pointsM.forEach(p => {
    ctxHeatmap.beginPath();
    ctxHeatmap.arc(p.x, p.y, 2.5, 0, 2 * Math.PI);
    ctxHeatmap.fillStyle = dotColorM;
    ctxHeatmap.fill();
  });
  
  setupHeatmapPointer(matrixYears, intervals, cell, validTreasury, validMortgage);
}

function initHeatmapControls() {
  const searchInput = regionSearchEl;
  const clearBtn = clearSearchEl;
  const dropdown = searchDropdownEl;
  
  // Preset buttons
  Object.keys(HeatmapPresets).forEach(presetId => {
    const btn = document.getElementById(presetId);
    btn.addEventListener("click", () => {
      const key = HeatmapPresets[presetId];
      const region = payload.regions.find(r => r.key === key);
      if (region) {
        searchInput.value = "";
        clearBtn.hidden = true;
        dropdown.hidden = true;
        setActivePresetTab(key);
        renderHeatmap(region);
      }
    });
  });
  
  // Inflation toggle
  inflationToggleEl.addEventListener("change", (e) => {
    isInflationAdjusted = e.target.checked;
    renderHeatmap(activeRegion);
  });
  
  // Autocomplete search
  searchInput.addEventListener("focus", () => {
    searchInput.dispatchEvent(new Event("input"));
  });
  
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase().replace(/[\s,]+/g, "");
    if (query === "") {
      clearBtn.hidden = true;
      dropdown.hidden = true;
      return;
    }
    
    clearBtn.hidden = false;
    const matches = payload.regions.filter(r => {
      return r.name.toLowerCase().replace(/[\s,]+/g, "").includes(query) || 
             r.state.toLowerCase().replace(/[\s,]+/g, "").includes(query);
    });
    
    if (matches.length === 0) {
      dropdown.innerHTML = `<div class="dropdown-item" style="cursor: default; color: var(--muted);">No regions found</div>`;
      dropdown.hidden = false;
      return;
    }
    
    matches.sort((a, b) => {
      const type_order = { national: 0, state: 1, metro: 2 };
      if (type_order[a.type] !== type_order[b.type]) return type_order[a.type] - type_order[b.type];
      return a.sizeRank - b.sizeRank;
    });
    
    dropdown.innerHTML = matches.slice(0, 15).map(r => {
      const label = r.type === "metro" ? "Metro" : (r.type === "state" ? "State" : "National");
      return `
        <div class="dropdown-item" data-key="${r.key}">
          <span>${r.name}</span>
          <span class="region-type">${label}</span>
        </div>
      `;
    }).join("");
    dropdown.hidden = false;
  });
  
  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (!item) return;
    const key = item.getAttribute("data-key");
    if (!key) return;
    
    const region = payload.regions.find(r => r.key === key);
    if (region) {
      searchInput.value = region.name;
      dropdown.hidden = true;
      setActivePresetTab(key);
      renderHeatmap(region);
    }
  });
  
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.hidden = true;
    dropdown.hidden = true;
    const usRegion = payload.regions.find(r => r.key === HeatmapPresets["preset-us"]);
    setActivePresetTab(usRegion.key);
    renderHeatmap(usRegion);
  });
  
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrapper")) dropdown.hidden = true;
  });
}

// ==========================================
// TAB 2: TWIN PEAKS CITY Sparklines
// ==========================================
function renderTwinPeaks() {
  const metros = payload.regions.filter(r => r.type === "metro").slice(0, 45);
  
  const metrosData = metros.map(r => {
    const firstIdx = r.values.findIndex(v => v !== null);
    const validYears = payload.years.slice(firstIdx);
    const validValues = r.values.slice(firstIdx);
    
    const gfc = calculateGfcCrash(validYears, validValues);
    const gfcDrop = gfc ? gfc.dropPct : 0.0;
    
    const startVal = validValues[0];
    const endVal = validValues[validValues.length - 1];
    const totalGrowth = ((endVal - startVal) / startVal) * 100;
    
    return {
      region: r,
      firstIdx: firstIdx,
      gfcDrop: gfcDrop,
      growth: totalGrowth,
      gfcText: gfc ? `${gfc.dropPct.toFixed(1)}%` : "0.0%"
    };
  });
  
  if (activeTwinPeaksSort === "gfc") {
    metrosData.sort((a, b) => a.gfcDrop - b.gfcDrop);
  } else {
    metrosData.sort((a, b) => b.growth - a.growth);
  }
  
  sparklineTableBody.innerHTML = metrosData.map(d => {
    const isSelected = selectedTwinPeaksMetro === d.region.key ? "selected-row" : "";
    return `
      <tr class="${isSelected}" data-key="${d.region.key}">
        <td><strong>${d.region.name}</strong></td>
        <td style="text-align: right; font-weight: 600; color: var(--danger);">${d.gfcText}</td>
        <td style="text-align: right; font-weight: 600; color: var(--primary);">${d.growth.toFixed(1)}%</td>
        <td>
          <div class="sparkline-wrap">
            <canvas class="sparkline-canvas" width="280" height="30" data-key="${d.region.key}"></canvas>
          </div>
        </td>
      </tr>
    `;
  }).join("");
  
  metrosData.forEach(d => {
    const canvasEl = document.querySelector(`.sparkline-canvas[data-key="${d.region.key}"]`);
    if (canvasEl) {
      drawSparkline(canvasEl, d.region.values);
    }
  });
  
  document.querySelectorAll("#sparkline-table-body tr").forEach(row => {
    row.addEventListener("click", () => {
      document.querySelectorAll("#sparkline-table-body tr").forEach(r => r.classList.remove("selected-row"));
      row.classList.add("selected-row");
      const key = row.getAttribute("data-key");
      selectedTwinPeaksMetro = key;
      showTwinPeaksDetails(key);
    });
  });
  
  if (!selectedTwinPeaksMetro && metrosData.length > 0) {
    selectedTwinPeaksMetro = metrosData[0].region.key;
    document.querySelector(`#sparkline-table-body tr[data-key="${selectedTwinPeaksMetro}"]`).classList.add("selected-row");
  }
  showTwinPeaksDetails(selectedTwinPeaksMetro);
}

function drawSparkline(canvas, rawValues) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  
  const firstIdx = rawValues.findIndex(v => v !== null);
  if (firstIdx === -1) return;
  
  const values = rawValues.slice(firstIdx);
  const indexed = values.map(v => (v / values[0]) * 100);
  
  const minVal = Math.min(...indexed);
  const maxVal = Math.max(...indexed);
  
  const yMin = Math.min(80, minVal * 0.9);
  const yMax = maxVal * 1.05;
  
  const count = indexed.length;
  const dx = w / (count - 1);
  
  const points = indexed.map((val, idx) => {
    const x = idx * dx;
    const y = h - ((val - yMin) / (yMax - yMin)) * h;
    return { x, y };
  });
  
  // Fill
  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();
  
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(82, 99, 67, 0.15)");
  grad.addColorStop(1, "rgba(82, 99, 67, 0.0)");
  ctx.fillStyle = grad;
  ctx.fill();
  
  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = "var(--primary)";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  
  // GFC Peak (2006)
  const validYears = payload.years.slice(firstIdx);
  const idx2006 = validYears.indexOf(2006);
  if (idx2006 !== -1) {
    const gfcPeakPt = points[idx2006];
    ctx.beginPath();
    ctx.arc(gfcPeakPt.x, gfcPeakPt.y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = "var(--danger)";
    ctx.fill();
  }
  
  // 2026 current
  const currentPt = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(currentPt.x, currentPt.y, 3, 0, 2 * Math.PI);
  ctx.fillStyle = "#d4a373";
  ctx.fill();
}

function showTwinPeaksDetails(key) {
  const r = payload.regions.find(x => x.key === key);
  if (!r) return;
  
  const firstIdx = r.values.findIndex(v => v !== null);
  const validYears = payload.years.slice(firstIdx);
  const validValues = r.values.slice(firstIdx);
  
  const gfc = calculateGfcCrash(validYears, validValues);
  const startVal = validValues[0];
  const peakVal = gfc ? gfc.peakVal : startVal;
  const troughVal = gfc ? gfc.troughVal : startVal;
  const endVal = validValues[validValues.length - 1];
  
  const indexedPeak = (peakVal / startVal) * 100;
  const indexedTrough = (troughVal / startVal) * 100;
  const indexed2026 = (endVal / startVal) * 100;
  
  trendDetailsContent.innerHTML = `
    <h3>${r.name}</h3>
    <p class="body-text" style="margin-top: 8px; font-weight: 500;">
      Values indexed to 100 in the year ${validYears[0]}:
    </p>
    <div class="detail-metric-row">
      <span>Year ${validYears[0]} Baseline</span>
      <span class="detail-metric-val">100.0</span>
    </div>
    <div class="detail-metric-row">
      <span>GFC Peak HPI (${gfc ? gfc.peakYear : "2006"})</span>
      <span class="detail-metric-val" style="color: var(--danger);">${indexedPeak.toFixed(1)}</span>
    </div>
    <div class="detail-metric-row">
      <span>GFC Trough HPI (${gfc ? gfc.troughYear : "2012"})</span>
      <span class="detail-metric-val" style="color: var(--danger);">${indexedTrough.toFixed(1)}</span>
    </div>
    <div class="detail-metric-row">
      <span>Current 2026 HPI</span>
      <span class="detail-metric-val" style="color: var(--primary);">${indexed2026.toFixed(1)}</span>
    </div>
    
    <div class="card" style="margin-top: 14px; background: white;">
      <h3>Crash Severity</h3>
      <p style="color: var(--danger);">${gfc ? `${gfc.dropPct.toFixed(1)}%` : "0.0%"}</p>
      <span class="card-note">Relative to its pre-crash peak.</span>
    </div>
    <div class="card" style="margin-top: 8px; background: white;">
      <h3>Net Appreciation</h3>
      <p style="color: var(--primary);">+${((endVal - startVal) / startVal * 100).toFixed(0)}%</p>
      <span class="card-note">Total value increase since ${validYears[0]}.</span>
    </div>
  `;
}

function initTwinPeaksControls() {
  sortGfcBtn.addEventListener("click", () => {
    sortGfcBtn.classList.add("active");
    sortGrowthBtn.classList.remove("active");
    activeTwinPeaksSort = "gfc";
    renderTwinPeaks();
  });
  
  sortGrowthBtn.addEventListener("click", () => {
    sortGrowthBtn.classList.add("active");
    sortGfcBtn.classList.remove("active");
    activeTwinPeaksSort = "growth";
    renderTwinPeaks();
  });
}

// ==========================================
// TAB 3: WITHIN-CITY ZIP CODE VARIANCE
// ==========================================
function renderVariance() {
  if (!zipVarianceData) return;
  
  const zips = zipVarianceData[activeVarianceCity];
  if (!zips) {
    zipBarChartEl.innerHTML = `<p class="muted-msg">No ZIP-level data available for ${activeVarianceCity}</p>`;
    return;
  }
  
  // Render Bar list
  const maxDeclineVal = Math.min(...zips.map(z => z.drop));
  
  zipBarChartEl.innerHTML = zips.map(z => {
    const barWidth = (-z.drop / 80) * 100;
    const color = interpolateColor([
      { value: -20, color: "#bc6a69" },
      { value: -40, color: "#8c3f3f" },
      { value: -60, color: "#4f1616" }
    ], z.drop);
    
    return `
      <div class="bar-row">
        <div class="bar-label-zip">${z.zip}</div>
        <div class="bar-track">
          <div class="bar-fill neg" style="width: ${barWidth}%; background-color: ${color};">
            ${z.drop.toFixed(1)}%
          </div>
        </div>
        <div class="bar-label-pop">${z.density.toLocaleString(undefined, {maximumFractionDigits: 0})} / km²</div>
      </div>
    `;
  }).join("");
  
  // Render density correlation
  const sortedByDensity = [...zips].sort((a, b) => b.density - a.density);
  const denseGroup = sortedByDensity.slice(0, Math.min(3, Math.floor(zips.length / 2)));
  const sprawlGroup = sortedByDensity.slice(-Math.min(3, Math.floor(zips.length / 2)));
  
  if (denseGroup.length > 0 && sprawlGroup.length > 0) {
    const avgDenseDrop = denseGroup.reduce((sum, z) => sum + z.drop, 0) / denseGroup.length;
    const avgSprawlDrop = sprawlGroup.reduce((sum, z) => sum + z.drop, 0) / sprawlGroup.length;
    
    const diff = avgSprawlDrop - avgDenseDrop;
    
    densityStatTextEl.innerHTML = `
      In <strong>${activeVarianceCity}</strong>, denser urban neighborhoods crashed on average 
      <strong style="color: var(--accent);">${avgDenseDrop.toFixed(1)}%</strong> during the GFC, while 
      the lowest density outer rings crashed by 
      <strong style="color: var(--danger);">${avgSprawlDrop.toFixed(1)}%</strong>. 
      <br /><br />
      Denser neighborhoods held values 
      <strong>${Math.abs(diff).toFixed(1)} percentage points</strong> better.
    `;
  } else {
    densityStatTextEl.innerHTML = `Insufficent ZIP codes to run density correlation calculations.`;
  }
  
  // Scatter plot
  drawScatterPlot(zips);
}

function drawScatterPlot(zips) {
  const w = scatterCanvas.width;
  const h = scatterCanvas.height;
  ctxScatter.clearRect(0, 0, w, h);
  
  const plotMargin = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = w - plotMargin.left - plotMargin.right;
  const plotH = h - plotMargin.top - plotMargin.bottom;
  
  const densities = zips.map(z => z.density);
  const maxDensity = Math.max(...densities, 100);
  const minDensity = 0;
  
  const minY = 0;
  const maxY = -80;
  
  ctxScatter.strokeStyle = "#e8e4da";
  ctxScatter.lineWidth = 1;
  ctxScatter.fillStyle = "#888";
  ctxScatter.font = "10px Inter, sans-serif";
  
  for (let d = 0; d >= -80; d -= 20) {
    const y = plotMargin.top + ((d - minY) / (maxY - minY)) * plotH;
    ctxScatter.beginPath();
    ctxScatter.moveTo(plotMargin.left, y);
    ctxScatter.lineTo(plotMargin.left + plotW, y);
    ctxScatter.stroke();
    
    ctxScatter.textAlign = "right";
    ctxScatter.fillText(`${d}%`, plotMargin.left - 8, y + 3);
  }
  
  const densityStep = maxDensity > 2000 ? 1000 : (maxDensity > 1000 ? 500 : 200);
  const stepLimit = Math.ceil(maxDensity / densityStep) * densityStep;
  for (let xVal = 0; xVal <= stepLimit; xVal += densityStep) {
    const x = plotMargin.left + ((xVal - minDensity) / (maxDensity - minDensity)) * plotW;
    if (x > plotMargin.left + plotW) continue;
    
    ctxScatter.beginPath();
    ctxScatter.moveTo(x, plotMargin.top);
    ctxScatter.lineTo(x, plotMargin.top + plotH);
    ctxScatter.stroke();
    
    ctxScatter.textAlign = "center";
    ctxScatter.fillText(String(xVal), x, plotMargin.top + plotH + 16);
  }
  
  const points = zips.map(z => {
    const x = plotMargin.left + ((z.density - minDensity) / (maxDensity - minDensity)) * plotW;
    const y = plotMargin.top + ((z.drop - minY) / (maxY - minY)) * plotH;
    return { x, y, zip: z.zip, drop: z.drop, density: z.density };
  });
  
  points.forEach(p => {
    ctxScatter.beginPath();
    ctxScatter.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctxScatter.fillStyle = "rgba(156, 74, 74, 0.75)";
    ctxScatter.fill();
    ctxScatter.strokeStyle = "#9c4a4a";
    ctxScatter.lineWidth = 1;
    ctxScatter.stroke();
  });
  
  const n = zips.length;
  if (n >= 3) {
    const meanX = zips.reduce((sum, z) => sum + z.density, 0) / n;
    const meanY = zips.reduce((sum, z) => sum + z.drop, 0) / n;
    
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const z = zips[i];
      num += (z.density - meanX) * (z.drop - meanY);
      den += (z.density - meanX) ** 2;
    }
    
    const m = den !== 0 ? num / den : 0;
    const c = meanY - m * meanX;
    
    const x1Val = 0;
    const y1Val = m * x1Val + c;
    const x2Val = maxDensity;
    const y2Val = m * x2Val + c;
    
    const x1 = plotMargin.left + ((x1Val - minDensity) / (maxDensity - minDensity)) * plotW;
    const y1 = plotMargin.top + ((y1Val - minY) / (maxY - minY)) * plotH;
    const x2 = plotMargin.left + ((x2Val - minDensity) / (maxDensity - minDensity)) * plotW;
    const y2 = plotMargin.top + ((y2Val - minY) / (maxY - minY)) * plotH;
    
    ctxScatter.beginPath();
    ctxScatter.moveTo(x1, y1);
    ctxScatter.lineTo(x2, y2);
    ctxScatter.strokeStyle = "var(--accent)";
    ctxScatter.lineWidth = 2;
    ctxScatter.setLineDash([4, 4]);
    ctxScatter.stroke();
    ctxScatter.setLineDash([]);
  }
  
  scatterCanvas.onmousemove = (event) => {
    const rect = scatterCanvas.getBoundingClientRect();
    const scaleX = w / rect.width;
    const scaleY = h / rect.height;
    
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;
    
    let closest = null;
    let minDist = 8;
    
    points.forEach(p => {
      const dist = Math.hypot(p.x - mouseX, p.y - mouseY);
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    });
    
    if (closest) {
      scatterTooltip.hidden = false;
      scatterTooltip.style.left = `${event.clientX - rect.left + 14}px`;
      scatterTooltip.style.top = `${event.clientY - rect.top - 50}px`;
      scatterTooltip.innerHTML = `
        <strong>ZIP Code: ${closest.zip}</strong>
        GFC Crash Drop: <span class="return-val negative">${closest.drop.toFixed(1)}%</span><br />
        Density: <strong>${closest.density.toLocaleString(undefined, {maximumFractionDigits: 0})} / km²</strong>
      `;
    } else {
      scatterTooltip.hidden = true;
    }
  };
  
  scatterCanvas.onmouseleave = () => {
    scatterTooltip.hidden = true;
  };
}

function initVarianceControls() {
  const searchInput = cityVarianceSearchEl;
  const clearBtn = clearVarianceSearchEl;
  const dropdown = varianceDropdownEl;
  
  searchInput.addEventListener("focus", () => {
    searchInput.dispatchEvent(new Event("input"));
  });
  
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (query === "") {
      dropdown.hidden = true;
      return;
    }
    
    const cities = Object.keys(zipVarianceData);
    const matches = cities.filter(c => c.toLowerCase().includes(query));
    
    if (matches.length === 0) {
      dropdown.innerHTML = `<div class="dropdown-item" style="cursor: default; color: var(--muted);">No cities found</div>`;
      dropdown.hidden = false;
      return;
    }
    
    dropdown.innerHTML = matches.slice(0, 10).map(city => {
      return `<div class="dropdown-item" data-city="${city}">${city}</div>`;
    }).join("");
    dropdown.hidden = false;
  });
  
  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (!item) return;
    const city = item.getAttribute("data-city");
    if (!city) return;
    
    searchInput.value = city;
    dropdown.hidden = true;
    activeVarianceCity = city;
    renderVariance();
  });
  
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    dropdown.hidden = true;
  });
  
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrapper")) dropdown.hidden = true;
  });
}

// ==========================================
// BOOT APPLICATION
// ==========================================
async function main() {
  initNavigation();
  initThemeToggle();
  
  // 1. Fetch Heatmap datasets
  const response = await fetch("./data/housing_annual_returns.json");
  if (!response.ok) throw new Error("Failed to load housing_annual_returns.json");
  payload = await response.json();
  
  // 2. Fetch ZIP variance datasets
  const zipResponse = await fetch("./data/zip_variance.json");
  if (!zipResponse.ok) throw new Error("Failed to load zip_variance.json");
  zipVarianceData = await zipResponse.json();
  
  // Initialize panels
  initHeatmapControls();
  initTwinPeaksControls();
  initVarianceControls();
  
  // Default views
  activeRegion = payload.regions.find(r => r.key === resolvePresetKey("preset-us"));
  renderHeatmap(activeRegion);
}

// Polyfill preset key resolution
function resolvePresetKey(presetId) {
  if (presetId === "preset-nv") {
    return "state_nevada";
  }
  return HeatmapPresets[presetId];
}

// Set active status on preset buttons
function setActivePresetTab(key) {
  Object.keys(HeatmapPresets).forEach(presetId => {
    const btn = document.getElementById(presetId);
    if (!btn) return;
    const presetKey = resolvePresetKey(presetId);
    if (presetKey === key) {
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
    } else {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    }
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.createElement("pre");
  el.textContent = `Visualizer Boot Error: ${err.message}`;
  el.style.color = "var(--danger)";
  el.style.padding = "20px";
  el.style.background = "var(--panel)";
  el.style.border = "1px solid var(--grid)";
  el.style.borderRadius = "8px";
  document.body.appendChild(el);
});
