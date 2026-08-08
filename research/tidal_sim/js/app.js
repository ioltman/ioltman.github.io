import { EarthView } from "./earth3d.js";
import { Earth2DView } from "./earth2d.js";
import { OrbitView } from "./orbit3d.js";
import { TimeSeries } from "./timeseries.js";
import { THEORY_HTML } from "./theory.js";

const SCENARIOS = [
  { key: "normal", label: "Normal (1 Moon)" },
  { key: "rod", label: "Rod-linked Moon" },
  { key: "two_moon", label: "Two Moons" },
  { key: "realistic", label: "Realistic Geometry" },
];
const MOON_DOT_COLORS = ["#dddddd", "#ffa552", "#8ecae6"];
const DEFAULT_POINT = { lat: 6.0, lon: 180.0 };

const tabsEl = document.getElementById("tabs");
const viewsEl = document.getElementById("app-views");
const tpl = document.getElementById("tpl-scenario");

const state = {}; // key -> { meta, etaBuf, earthView, orbitView, ts, frame, playing, timer, viewEl }

function buildTabs() {
  SCENARIOS.forEach((s) => {
    const b = document.createElement("button");
    b.textContent = s.label;
    b.dataset.key = s.key;
    b.addEventListener("click", () => activate(s.key));
    tabsEl.appendChild(b);
  });
  const tb = document.createElement("button");
  tb.textContent = "Theory";
  tb.dataset.key = "theory";
  tb.addEventListener("click", () => activate("theory"));
  tabsEl.appendChild(tb);
}

function buildTheoryView() {
  const el = document.createElement("section");
  el.className = "view";
  el.id = "view-theory";
  el.innerHTML = THEORY_HTML;
  viewsEl.appendChild(el);
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
    });
  } else {
    // KaTeX auto-render script tag is deferred; wait for it.
    window.addEventListener("load", () => {
      window.renderMathInElement && window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
      });
    });
  }
}

function buildScenarioShell(key) {
  const frag = tpl.content.cloneNode(true);
  const el = frag.querySelector(".view");
  el.id = `view-${key}`;
  viewsEl.appendChild(frag);
  return document.getElementById(`view-${key}`);
}

async function loadScenario(key) {
  if (state[key]) return state[key];
  const base = `data/${key}`;
  const [meta, etaBuf] = await Promise.all([
    fetch(`${base}/meta.json`).then((r) => r.json()),
    fetch(`${base}/eta.bin`).then((r) => r.arrayBuffer()),
  ]);
  const eta = new Float32Array(etaBuf);

  const viewEl = buildScenarioShell(key);
  const mount2d = viewEl.querySelector(".earth-mount-2d");
  const mount3d = viewEl.querySelector(".earth-mount-3d");
  const orbitMount = viewEl.querySelector(".orbit-mount");

  const s = {
    meta, eta, viewEl, frame: 0, playing: false, timer: null,
    pick: { ...DEFAULT_POINT }, mount3d, earthView: null, // 3D built lazily, see setDimension()
  };

  s.earth2DView = new Earth2DView(mount2d, meta, (lat, lon) => pickPoint(key, lat, lon));
  s.orbitView = new OrbitView(orbitMount, meta);

  viewEl.querySelectorAll(".dim-btn").forEach((btn) => {
    btn.addEventListener("click", () => setDimension(key, btn.dataset.dim));
  });
  s.ts = new TimeSeries(viewEl.querySelector(".ts-mount"), (tDays) => {
    const f = s.ts.nearestFrame(tDays);
    setFrame(key, f);
  });

  // moon legend
  const legend = viewEl.querySelector(".moon-legend");
  Object.keys(meta.moons).forEach((name, i) => {
    const massRel = meta.moons[name].mass_rel_to_moon;
    const b = document.createElement("span");
    b.className = "moon-badge";
    b.innerHTML = `<span class="dot" style="background:${MOON_DOT_COLORS[i % 3]}"></span>${name} (${massRel.toFixed(2)}x lunar mass)`;
    legend.appendChild(b);
  });

  const slider = viewEl.querySelector(".frame-slider");
  slider.max = meta.n_time - 1;
  slider.addEventListener("input", () => {
    stopPlaying(key);
    setFrame(key, parseInt(slider.value, 10));
  });

  const playBtn = viewEl.querySelector(".play-btn");
  playBtn.addEventListener("click", () => {
    if (s.playing) stopPlaying(key); else startPlaying(key);
  });

  const speedSel = viewEl.querySelector(".speed-select");
  speedSel.addEventListener("change", () => {
    if (s.playing) { stopPlaying(key); startPlaying(key); }
  });

  state[key] = s;
  setFrame(key, 0);
  pickPoint(key, DEFAULT_POINT.lat, DEFAULT_POINT.lon, true);
  return s;
}

function etaFrameSlice(s, frameIdx) {
  const n = s.meta.n_lat * s.meta.n_lon;
  return s.eta.subarray(frameIdx * n, (frameIdx + 1) * n);
}

function setDimension(key, dim) {
  const s = state[key];
  s.viewEl.querySelectorAll(".dim-btn").forEach((b) => b.classList.toggle("active", b.dataset.dim === dim));
  const mount2d = s.viewEl.querySelector(".earth-mount-2d");
  const mount3d = s.viewEl.querySelector(".earth-mount-3d");
  if (dim === "3d") {
    mount2d.style.display = "none";
    mount3d.style.display = "block";
    if (!s.earthView) {
      // built lazily (and only after being made visible, so it reads a
      // correct non-zero container size) to avoid piling up WebGL contexts
      // for scenarios the user never asks to see in 3D
      s.earthView = new EarthView(mount3d, s.meta, (lat, lon) => pickPoint(key, lat, lon));
      s.earthView.setFrame(etaFrameSlice(s, s.frame));
      s.earthView.setMarker(s.pick.lat, s.pick.lon);
    } else {
      s.earthView.resize();
    }
  } else {
    mount3d.style.display = "none";
    mount2d.style.display = "block";
  }
}

function setFrame(key, frameIdx) {
  const s = state[key];
  frameIdx = Math.max(0, Math.min(s.meta.n_time - 1, frameIdx));
  s.frame = frameIdx;
  const slice = etaFrameSlice(s, frameIdx);
  s.earth2DView.setFrame(slice);
  if (s.earthView) s.earthView.setFrame(slice);
  s.orbitView.setFrame(frameIdx);
  s.ts.setFrameTime(s.meta.times_days[frameIdx]);
  s.viewEl.querySelector(".frame-slider").value = frameIdx;
  s.viewEl.querySelector(".day-readout").textContent = `day ${s.meta.times_days[frameIdx].toFixed(2)}`;
}

function nearestIndex(arr, val) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - val);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function pickPoint(key, latDeg, lonDeg, silent) {
  const s = state[key];
  const j = nearestIndex(s.meta.lat_deg, latDeg);
  const i = nearestIndex(s.meta.lon_deg, ((lonDeg % 360) + 360) % 360);
  s.pick = { lat: s.meta.lat_deg[j], lon: s.meta.lon_deg[i], j, i };

  const nlat = s.meta.n_lat, nlon = s.meta.n_lon, ntime = s.meta.n_time;
  const series = new Float32Array(ntime);
  const cellOffset = j * nlon + i;
  const frameStride = nlat * nlon;
  for (let t = 0; t < ntime; t++) series[t] = s.eta[t * frameStride + cellOffset];

  const isLand = s.meta.H[j][i] <= 0;
  s.ts.setSeries(Array.from(s.meta.times_days), Array.from(series),
    isLand ? "picked cell is land -- no ocean here" : `eta at ${s.pick.lat.toFixed(1)}°, ${s.pick.lon.toFixed(1)}°`);
  s.earth2DView.setMarker(s.pick.lat, s.pick.lon);
  if (s.earthView) s.earthView.setMarker(s.pick.lat, s.pick.lon);
  s.viewEl.querySelector(".pick-label").textContent =
    `${s.pick.lat.toFixed(1)}°N, ${s.pick.lon.toFixed(1)}°E${isLand ? " (land)" : ""}`;
  s.viewEl.querySelector(".pick-readout").textContent = isLand ? "land -- pick an ocean cell" : "point selected";
  s.ts.setFrameTime(s.meta.times_days[s.frame]);
}

function startPlaying(key) {
  const s = state[key];
  s.playing = true;
  s.viewEl.querySelector(".play-btn").innerHTML = "&#10074;&#10074; Pause";
  const ms = parseInt(s.viewEl.querySelector(".speed-select").value, 10);
  s.timer = setInterval(() => {
    let next = s.frame + 1;
    if (next >= s.meta.n_time) next = 0;
    setFrame(key, next);
  }, ms);
}

function stopPlaying(key) {
  const s = state[key];
  s.playing = false;
  if (s.timer) clearInterval(s.timer);
  s.viewEl.querySelector(".play-btn").innerHTML = "&#9654; Play";
}

async function activate(key) {
  [...tabsEl.children].forEach((b) => b.classList.toggle("active", b.dataset.key === key));
  [...viewsEl.children].forEach((v) => v.classList.remove("active"));

  if (key === "theory") {
    document.getElementById("view-theory").classList.add("active");
    return;
  }
  const s = await loadScenario(key);
  document.getElementById(`view-${key}`).classList.add("active");
  s.earth2DView.resize();
  if (s.earthView) s.earthView.resize();
  s.orbitView.resize();
  Plotly.Plots.resize(s.viewEl.querySelector(".ts-mount"));
}

buildTabs();
buildTheoryView();
activate("normal");
window.__appState = state; // debug hook
