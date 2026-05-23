const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");

const best20El = document.getElementById("best20");
const worst20El = document.getElementById("worst20");
const legendTitleEl = document.getElementById("legendTitle");
const legendTicksEl = document.getElementById("legendTicks");
const descriptionLine1El = document.getElementById("descriptionLine1");
const descriptionLine2El = document.getElementById("descriptionLine2");
const noteTextEl = document.getElementById("noteText");
const tabSp500El = document.getElementById("tab-sp500");
const tabGoldEl = document.getElementById("tab-gold");

const margin = { top: 74, right: 24, bottom: 24, left: 74 };

const VIEWS = {
  sp500: {
    key: "sp500",
    title: "S&P 500 (real returns)",
    legendTitle: "Annualized real return",
    description1:
      "A simple NYT-style recreation using annual S&P 500 total returns, inflation-adjusted to real returns, extended through 2025.",
    description2:
      "Each square is one start-year / end-year combination. Colors encode annualized real return for that interval.",
    note: "Note: this version uses inflation adjustment, but does not include taxes/fees drag from the original graphic.",
    rateLabel: "Annualized real return",
    growthLabel: "Real growth multiple",
    returnField: "sp500RealReturn",
    stops: [
      { value: -0.04, color: "#8c3f3f" },
      { value: 0.0, color: "#bc6a69" },
      { value: 0.03, color: "#d7c8b2" },
      { value: 0.07, color: "#8d9f63" },
      { value: 0.1, color: "#5a7b40" },
      { value: 0.14, color: "#315f32" },
    ],
    tickValues: [0, 0.03, 0.07, 0.1],
  },
  gold: {
    key: "gold",
    title: "Gold (nominal per-oz price return)",
    legendTitle: "Annualized nominal return",
    description1:
      "This tab recreates the same start-year / end-year matrix for gold, using annual per-ounce price returns through 2025.",
    description2:
      "Each square shows what annualized nominal gold return you would have experienced for that holding interval.",
    note: "Note: this gold view reflects nominal per-ounce price return (not inflation-adjusted and not taxes/fees adjusted).",
    rateLabel: "Annualized nominal return",
    growthLabel: "Price growth multiple",
    returnField: "goldNominalReturn",
    stops: [
      { value: -0.08, color: "#8c3f3f" },
      { value: 0.0, color: "#bc6a69" },
      { value: 0.04, color: "#d7c8b2" },
      { value: 0.08, color: "#8d9f63" },
      { value: 0.15, color: "#5a7b40" },
      { value: 0.25, color: "#315f32" },
    ],
    tickValues: [0, 0.04, 0.08, 0.15],
  },
};

let payload = null;
let activeView = VIEWS.sp500;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = Number.parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolateColor(stops, value) {
  if (value <= stops[0].value) return stops[0].color;
  if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      return rgbToHex({
        r: lerp(ca.r, cb.r, t),
        g: lerp(ca.g, cb.g, t),
        b: lerp(ca.b, cb.b, t),
      });
    }
  }
  return stops[stops.length - 1].color;
}

function pct(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function formatYears(start, end) {
  return `${start}-${end}`;
}

function buildIntervalsFromField(series, returnField) {
  const points = series
    .filter((d) => typeof d[returnField] === "number")
    .map((d) => ({ year: d.year, value: d[returnField] }));
  const years = points.map((d) => d.year);
  const returns = points.map((d) => d.value);

  const prefixLog = [0];
  for (let i = 0; i < returns.length; i += 1) {
    prefixLog.push(prefixLog[i] + Math.log(1 + returns[i]));
  }

  const intervals = [];
  for (let i = 0; i < years.length; i += 1) {
    for (let j = i; j < years.length; j += 1) {
      const yearsHeld = j - i + 1;
      const growth = Math.exp(prefixLog[j + 1] - prefixLog[i]);
      const cagr = Math.pow(growth, 1 / yearsHeld) - 1;
      intervals.push({
        startIdx: i,
        endIdx: j,
        startYear: years[i],
        endYear: years[j],
        yearsHeld,
        growth,
        cagr,
      });
    }
  }
  return { years, intervals };
}

function findBestWorst20(intervals) {
  const twenty = intervals.filter((d) => d.yearsHeld === 20);
  twenty.sort((a, b) => a.cagr - b.cagr);
  return { worst: twenty[0], best: twenty[twenty.length - 1] };
}

function setLegendTicks(tickValues) {
  legendTicksEl.innerHTML = "";
  tickValues.forEach((value, idx) => {
    const span = document.createElement("span");
    if (idx === tickValues.length - 1) {
      span.textContent = `${pct(value)}+`;
    } else {
      span.textContent = pct(value);
    }
    legendTicksEl.appendChild(span);
  });
}

function setupPointer(data, geometry, view) {
  const { years, intervalsByCell } = data;
  const { cell, drawW, drawH } = geometry;

  canvas.onmousemove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const localX = x - margin.left;
    const localY = y - margin.top;
    if (localX < 0 || localY < 0 || localX > drawW || localY > drawH) {
      tooltip.hidden = true;
      return;
    }

    const endIdx = Math.floor(localX / cell);
    const startIdx = Math.floor(localY / cell);
    if (
      startIdx < 0 ||
      endIdx < 0 ||
      startIdx >= years.length ||
      endIdx >= years.length ||
      endIdx < startIdx
    ) {
      tooltip.hidden = true;
      return;
    }

    const interval = intervalsByCell.get(`${startIdx}:${endIdx}`);
    if (!interval) {
      tooltip.hidden = true;
      return;
    }

    tooltip.hidden = false;
    tooltip.style.left = `${event.clientX - rect.left + 14}px`;
    tooltip.style.top = `${event.clientY - rect.top + 14}px`;
    tooltip.innerHTML = `
      <strong>${interval.startYear} → ${interval.endYear}</strong><br />
      Holding period: ${interval.yearsHeld} years<br />
      ${view.rateLabel}: <strong>${pct(interval.cagr)}</strong><br />
      ${view.growthLabel}: <strong>${interval.growth.toFixed(2)}x</strong>
    `;
  };

  canvas.onmouseleave = () => {
    tooltip.hidden = true;
  };
}

function draw(view, data) {
  const { years, intervals } = data;
  const count = years.length;
  const drawW = canvas.width - margin.left - margin.right;
  const drawH = canvas.height - margin.top - margin.bottom;
  const cell = Math.floor(Math.min(drawW, drawH) / count);

  ctx.fillStyle = "#efede6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const intervalsByCell = new Map();
  for (const item of intervals) {
    const x = margin.left + item.endIdx * cell;
    const y = margin.top + item.startIdx * cell;
    ctx.fillStyle = interpolateColor(view.stops, item.cagr);
    ctx.fillRect(x, y, cell, cell);
    intervalsByCell.set(`${item.startIdx}:${item.endIdx}`, item);
  }

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i += 1) {
    const j = i + 19;
    if (j >= count) break;
    const x = margin.left + j * cell + 0.5;
    const y = margin.top + i * cell + 0.5;
    ctx.strokeRect(x, y, cell - 1, cell - 1);
  }

  ctx.strokeStyle = "#d5cec1";
  ctx.lineWidth = 1;
  const tickStep = 10;
  for (let i = 0; i <= count; i += tickStep) {
    const x = margin.left + i * cell + 0.5;
    const y = margin.top + i * cell + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + count * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + count * cell, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#575757";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let i = 0; i < count; i += 10) {
    const x = margin.left + i * cell;
    ctx.fillText(String(years[i]), x + 14, margin.top - 8);
  }
  ctx.fillText(String(years[count - 1]), margin.left + (count - 1) * cell, margin.top - 8);

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i < count; i += 10) {
    const y = margin.top + i * cell + 4;
    ctx.fillText(String(years[i]), margin.left - 8, y);
  }
  ctx.fillText(String(years[count - 1]), margin.left - 8, margin.top + (count - 1) * cell + 4);

  setupPointer({ years, intervalsByCell }, { cell, drawW, drawH }, view);
}

function setActiveTab(viewKey) {
  tabSp500El.classList.toggle("active", viewKey === "sp500");
  tabGoldEl.classList.toggle("active", viewKey === "gold");
  tabSp500El.setAttribute("aria-selected", String(viewKey === "sp500"));
  tabGoldEl.setAttribute("aria-selected", String(viewKey === "gold"));
}

function render(view) {
  activeView = view;
  setActiveTab(view.key);

  legendTitleEl.textContent = view.legendTitle;
  setLegendTicks(view.tickValues);
  descriptionLine1El.innerHTML = view.description1;
  descriptionLine2El.textContent = view.description2;
  noteTextEl.textContent = view.note;

  const intervalData = buildIntervalsFromField(payload.series, view.returnField);
  const { best, worst } = findBestWorst20(intervalData.intervals);
  best20El.textContent = `${formatYears(best.startYear, best.endYear)} (${pct(best.cagr)} / year)`;
  worst20El.textContent = `${formatYears(worst.startYear, worst.endYear)} (${pct(worst.cagr)} / year)`;

  draw(view, intervalData);
}

async function main() {
  const response = await fetch("./data/annual_returns.json");
  if (!response.ok) throw new Error("Failed to load data/annual_returns.json");
  payload = await response.json();

  tabSp500El.addEventListener("click", () => render(VIEWS.sp500));
  tabGoldEl.addEventListener("click", () => render(VIEWS.gold));

  render(VIEWS.sp500);
}

main().catch((err) => {
  const el = document.createElement("pre");
  el.textContent = `Error: ${err.message}`;
  el.style.color = "#8c2f2f";
  document.body.appendChild(el);
});
