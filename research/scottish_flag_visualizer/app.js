"use strict";

const state = {
  lambda: { re: 1, im: 0.4 },
  p0: { re: 0, im: 0 },
  x0: { re: 0, im: 0 },
  energy: { re: 0.5, im: 0.5 },
  n: 24,
  showEigenvalues: true,
  showPFlow: true,
  showPiFlow: true,
  spectrum: [],
  sigma: [],
  elapsedMs: 0,
};

const configs = {
  lambda: { label: "λ", minRe: -3, maxRe: 3, minIm: -3, maxIm: 3 },
  p0: { label: "p₀", minRe: -Math.PI, maxRe: Math.PI, minIm: -3, maxIm: 3 },
  x0: { label: "x₀", minRe: -Math.PI, maxRe: Math.PI, minIm: -3, maxIm: 3 },
};

const pads = {};
let requestTimer = null;
let computeToken = 0;
let renderPlot = () => {};
let renderMomentum = () => {};
let plotTransform = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatReal(value, digits = 3) {
  const clean = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return clean.toFixed(digits);
}

function formatComplex(value, digits = 3) {
  const real = formatReal(value.re, digits);
  const imagMagnitude = Math.abs(Number(formatReal(value.im, digits))).toFixed(digits);
  if (Math.abs(value.im) < 0.5 * 10 ** -digits) return real;
  return `${real} ${value.im >= 0 ? "+" : "−"} ${imagMagnitude}i`;
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

class ComplexPad {
  constructor(key) {
    this.key = key;
    this.config = configs[key];
    this.canvas = document.getElementById(`${key}-pad`);
    this.ctx = this.canvas.getContext("2d");
    this.reInput = document.getElementById(`${key}-re`);
    this.imInput = document.getElementById(`${key}-im`);
    this.display = document.getElementById(`${key}-display`);
    this.padding = 38;
    this.dragging = false;
    this.bind();
    this.syncControls();
  }

  bind() {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
      this.setFromPointer(event);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.dragging) this.setFromPointer(event);
    });
    this.canvas.addEventListener("pointerup", (event) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
      queueRefresh(0);
    });
    this.canvas.addEventListener("pointercancel", () => { this.dragging = false; });
    this.canvas.addEventListener("keydown", (event) => {
      const fine = event.shiftKey ? 0.01 : 0.05;
      const delta = { re: 0, im: 0 };
      if (event.key === "ArrowLeft") delta.re = -fine;
      else if (event.key === "ArrowRight") delta.re = fine;
      else if (event.key === "ArrowDown") delta.im = -fine;
      else if (event.key === "ArrowUp") delta.im = fine;
      else return;
      event.preventDefault();
      state[this.key].re = clamp(state[this.key].re + delta.re, this.config.minRe, this.config.maxRe);
      state[this.key].im = clamp(state[this.key].im + delta.im, this.config.minIm, this.config.maxIm);
      this.syncControls();
      queueRefresh();
    });
    this.reInput.addEventListener("input", () => this.setFromInputs());
    this.imInput.addEventListener("input", () => this.setFromInputs());
  }

  setFromPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * this.canvas.width / rect.width;
    const y = (event.clientY - rect.top) * this.canvas.height / rect.height;
    const inner = this.canvas.width - 2 * this.padding;
    state[this.key].re = clamp(
      this.config.minRe + (x - this.padding) / inner * (this.config.maxRe - this.config.minRe),
      this.config.minRe,
      this.config.maxRe,
    );
    state[this.key].im = clamp(
      this.config.maxIm - (y - this.padding) / inner * (this.config.maxIm - this.config.minIm),
      this.config.minIm,
      this.config.maxIm,
    );
    this.syncControls();
    queueRefresh(70);
  }

  setFromInputs() {
    const re = Number(this.reInput.value);
    const im = Number(this.imInput.value);
    if (Number.isFinite(re)) state[this.key].re = clamp(re, this.config.minRe, this.config.maxRe);
    if (Number.isFinite(im)) state[this.key].im = clamp(im, this.config.minIm, this.config.maxIm);
    this.syncControls(false);
    queueRefresh();
  }

  syncControls(updateInputs = true) {
    if (updateInputs) {
      this.reInput.value = Number(state[this.key].re.toFixed(4));
      this.imInput.value = Number(state[this.key].im.toFixed(4));
    }
    this.display.value = formatComplex(state[this.key]);
    this.canvas.setAttribute(
      "aria-valuetext",
      `${this.config.label} equals ${formatComplex(state[this.key])}`,
    );
    this.draw();
  }

  draw() {
    const { ctx, canvas, padding, config } = this;
    const size = canvas.width;
    const inner = size - 2 * padding;
    const background = cssColor("--panel-strong");
    const grid = cssColor("--grid");
    const axis = cssColor("--axis");
    const text = cssColor("--muted");
    const active = cssColor("--blue");

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);

    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    for (let i = 0; i <= 6; i += 1) {
      const p = padding + inner * i / 6;
      ctx.beginPath(); ctx.moveTo(p, padding); ctx.lineTo(p, size - padding); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padding, p); ctx.lineTo(size - padding, p); ctx.stroke();
    }

    const mapX = (value) => padding + (value - config.minRe) / (config.maxRe - config.minRe) * inner;
    const mapY = (value) => size - padding - (value - config.minIm) / (config.maxIm - config.minIm) * inner;
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.7;
    if (config.minRe <= 0 && config.maxRe >= 0) {
      const x = mapX(0); ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, size - padding); ctx.stroke();
    }
    if (config.minIm <= 0 && config.maxIm >= 0) {
      const y = mapY(0); ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(size - padding, y); ctx.stroke();
    }

    ctx.fillStyle = text;
    ctx.font = "22px ui-monospace, Consolas, monospace";
    ctx.fillText("Im", padding + 6, padding - 11);
    ctx.textAlign = "right";
    ctx.fillText("Re", size - padding, size - 10);
    ctx.textAlign = "left";

    const point = state[this.key];
    const x = mapX(point.re);
    const y = mapY(point.im);
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 2 * Math.PI);
    ctx.fillStyle = active; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = background; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 15, 0, 2 * Math.PI);
    ctx.lineWidth = 2; ctx.strokeStyle = active; ctx.stroke();
  }
}

function niceStep(span, targetTicks = 8) {
  const raw = span / targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function installPlotRenderer() {
  const svg = document.getElementById("spectrum-plot");
  const wrap = document.getElementById("plot-wrap");
  const tooltip = document.getElementById("plot-tooltip");
  const pointDetail = document.getElementById("point-detail");
  let energyDragging = false;

  function updateEnergyReadouts() {
    const label = `E = ${formatComplex(state.energy)}`;
    document.getElementById("energy-display").value = label;
    document.getElementById("momentum-energy-display").value = label;
  }

  function positionEnergyMarker() {
    if (!plotTransform) return;
    const marker = document.getElementById("energy-point");
    const label = document.getElementById("energy-point-label");
    if (!marker || !label) return;
    const px = plotTransform.x(state.energy.re);
    const py = plotTransform.y(state.energy.im);
    marker.setAttribute("cx", px);
    marker.setAttribute("cy", py);
    label.setAttribute("x", px + 10);
    label.setAttribute("y", py - 10);
  }

  function setEnergyFromPointer(event) {
    if (!plotTransform) return;
    const rect = svg.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) * plotTransform.width / rect.width;
    const svgY = (event.clientY - rect.top) * plotTransform.height / rect.height;
    state.energy.re = clamp(
      plotTransform.minX + (svgX - plotTransform.margin.left) / plotTransform.scale,
      plotTransform.minX,
      plotTransform.maxX,
    );
    state.energy.im = clamp(
      plotTransform.maxY - (svgY - plotTransform.margin.top) / plotTransform.scale,
      plotTransform.minY,
      plotTransform.maxY,
    );
    updateEnergyReadouts();
    positionEnergyMarker();
    queueMomentumUpdate(20);
  }

  renderPlot = () => {
    const width = Math.max(420, wrap.clientWidth);
    const height = Math.max(420, svg.clientHeight || 560);
    const margin = { top: 20, right: 24, bottom: 48, left: 62 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    while (svg.lastChild && !["title", "desc"].includes(svg.lastChild.tagName)) svg.removeChild(svg.lastChild);

    const visibleSpectrum = state.showEigenvalues ? state.spectrum : [];
    const all = [...visibleSpectrum, ...state.sigma, state.energy];
    if (!all.length) return;
    let minX = Math.min(...all.map((v) => v.re));
    let maxX = Math.max(...all.map((v) => v.re));
    let minY = Math.min(...all.map((v) => v.im));
    let maxY = Math.max(...all.map((v) => v.im));
    const spanX = Math.max(maxX - minX, 1.5);
    const spanY = Math.max(maxY - minY, 1.5);
    const dataPadding = 0.13;
    minX -= spanX * dataPadding; maxX += spanX * dataPadding;
    minY -= spanY * dataPadding; maxY += spanY * dataPadding;

    const scale = Math.min(plotWidth / (maxX - minX), plotHeight / (maxY - minY));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const visibleHalfX = plotWidth / (2 * scale);
    const visibleHalfY = plotHeight / (2 * scale);
    minX = centerX - visibleHalfX; maxX = centerX + visibleHalfX;
    minY = centerY - visibleHalfY; maxY = centerY + visibleHalfY;
    const x = (value) => margin.left + (value - minX) * scale;
    const y = (value) => margin.top + (maxY - value) * scale;
    plotTransform = { width, height, margin, scale, minX, maxX, minY, maxY, x, y };

    const gridGroup = svgElement("g");
    const xStep = niceStep(maxX - minX);
    const yStep = niceStep(maxY - minY);
    for (let value = Math.ceil(minX / xStep) * xStep; value <= maxX + 1e-10; value += xStep) {
      const px = x(value);
      gridGroup.appendChild(svgElement("line", { x1: px, y1: margin.top, x2: px, y2: height - margin.bottom, class: Math.abs(value) < xStep / 100 ? "plot-axis" : "plot-grid" }));
      const label = svgElement("text", { x: px, y: height - margin.bottom + 20, class: "plot-tick", "text-anchor": "middle" });
      label.textContent = formatReal(value, Math.abs(xStep) < 1 ? 2 : 1);
      gridGroup.appendChild(label);
    }
    for (let value = Math.ceil(minY / yStep) * yStep; value <= maxY + 1e-10; value += yStep) {
      const py = y(value);
      gridGroup.appendChild(svgElement("line", { x1: margin.left, y1: py, x2: width - margin.right, y2: py, class: Math.abs(value) < yStep / 100 ? "plot-axis" : "plot-grid" }));
      const label = svgElement("text", { x: margin.left - 10, y: py + 4, class: "plot-tick", "text-anchor": "end" });
      label.textContent = formatReal(value, Math.abs(yStep) < 1 ? 2 : 1);
      gridGroup.appendChild(label);
    }
    gridGroup.appendChild(svgElement("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight, class: "plot-frame" }));
    const xLabel = svgElement("text", { x: width - margin.right, y: height - 10, class: "axis-label", "text-anchor": "end" });
    xLabel.textContent = "Re E"; gridGroup.appendChild(xLabel);
    const yLabel = svgElement("text", { x: 8, y: margin.top + 5, class: "axis-label" });
    yLabel.textContent = "Im E"; gridGroup.appendChild(yLabel);
    svg.appendChild(gridGroup);
    svg.appendChild(svgElement("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight, class: "energy-hit-area" }));

    const polygonPoints = state.sigma.map((v) => `${x(v.re)},${y(v.im)}`).join(" ");
    svg.appendChild(svgElement("polygon", { points: polygonPoints, class: "sigma-shape" }));

    const pointGroup = svgElement("g");
    const radius = clamp(6 - state.n / 55, 2.6, 5.2);
    visibleSpectrum.forEach((value, index) => {
      const circle = svgElement("circle", { cx: x(value.re), cy: y(value.im), r: radius, class: "eigenvalue", tabindex: 0 });
      const label = `E${index + 1} = ${formatComplex(value, 6)}`;
      circle.setAttribute("aria-label", label);
      const show = () => {
        pointDetail.value = label;
        tooltip.textContent = label;
        tooltip.hidden = false;
        const left = clamp(x(value.re) + 10, 4, width - 190);
        const top = clamp(y(value.im) - 38, 4, height - 40);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };
      const hide = () => { tooltip.hidden = true; };
      circle.addEventListener("mouseenter", show);
      circle.addEventListener("focus", show);
      circle.addEventListener("mouseleave", hide);
      circle.addEventListener("blur", hide);
      pointGroup.appendChild(circle);
    });
    svg.appendChild(pointGroup);

    const energyGroup = svgElement("g");
    const energyPoint = svgElement("circle", {
      id: "energy-point",
      cx: x(state.energy.re),
      cy: y(state.energy.im),
      r: 7,
      class: "energy-point",
      "aria-label": `Energy E equals ${formatComplex(state.energy)}`,
    });
    const energyLabel = svgElement("text", {
      id: "energy-point-label",
      x: x(state.energy.re) + 10,
      y: y(state.energy.im) - 10,
      class: "energy-point-label",
    });
    energyLabel.textContent = "E";
    energyGroup.appendChild(energyPoint);
    energyGroup.appendChild(energyLabel);
    svg.appendChild(energyGroup);
    updateEnergyReadouts();
  };

  svg.addEventListener("pointerdown", (event) => {
    if (event.target.classList.contains("eigenvalue")) return;
    energyDragging = true;
    svg.setPointerCapture(event.pointerId);
    setEnergyFromPointer(event);
  });
  svg.addEventListener("pointermove", (event) => {
    if (energyDragging) setEnergyFromPointer(event);
  });
  svg.addEventListener("pointerup", (event) => {
    if (!energyDragging) return;
    energyDragging = false;
    svg.releasePointerCapture(event.pointerId);
    renderPlot();
  });
  svg.addEventListener("pointercancel", () => { energyDragging = false; });

  new ResizeObserver(() => renderPlot()).observe(wrap);
}

function multiplyComplex(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function divideComplex(a, b) {
  const denominator = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

function sqrtComplex(value) {
  const magnitude = Math.hypot(value.re, value.im);
  const re = Math.sqrt(Math.max(0, (magnitude + value.re) / 2));
  const im = (value.im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (magnitude - value.re) / 2));
  return { re, im };
}

function acosComplex(value) {
  const square = multiplyComplex(value, value);
  const root = sqrtComplex({ re: 1 - square.re, im: -square.im });
  const inside = { re: value.re - root.im, im: value.im + root.re };
  const logarithm = { re: Math.log(Math.max(Math.hypot(inside.re, inside.im), 1e-300)), im: Math.atan2(inside.im, inside.re) };
  return { re: logarithm.im, im: -logarithm.re };
}

function momentumField(x, y) {
  const cosine = {
    re: Math.cos(x) * Math.cosh(y),
    im: -Math.sin(x) * Math.sinh(y),
  };
  const product = multiplyComplex(state.lambda, cosine);
  return { re: state.energy.re - product.re, im: state.energy.im - product.im };
}

function continuousMomentum(x, y, previous = null) {
  const principal = acosComplex(momentumField(x, y));
  if (!previous) return principal;
  let best = principal;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const sign of [1, -1]) {
    const base = { re: sign * principal.re, im: sign * principal.im };
    const center = Math.round((previous.re - base.re) / (2 * Math.PI));
    for (let winding = center - 1; winding <= center + 1; winding += 1) {
      const candidate = { re: base.re + 2 * Math.PI * winding, im: base.im };
      const distance = Math.hypot(candidate.re - previous.re, candidate.im - previous.im);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function normalizedMomentumFlow(p, family, direction) {
  const vector = family === "p"
    ? { x: p.im, y: p.re }
    : { x: -p.im, y: Math.PI - p.re };
  const norm = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(norm) || norm < 1e-7) return null;
  return { x: direction * vector.x / norm, y: direction * vector.y / norm };
}

function nearMomentumTurningPoint(p) {
  const sinRe = Math.sin(p.re) * Math.cosh(p.im);
  const sinIm = Math.cos(p.re) * Math.sinh(p.im);
  return Math.hypot(sinRe, sinIm) < 0.035;
}

function traceMomentumFlow(seed, family, direction, bounds) {
  const step = 0.052;
  const points = [{ x: seed.x, y: seed.y, p: continuousMomentum(seed.x, seed.y) }];
  for (let index = 0; index < 360; index += 1) {
    const current = points[points.length - 1];
    if (nearMomentumTurningPoint(current.p)) break;
    const velocity = normalizedMomentumFlow(current.p, family, direction);
    if (!velocity) break;
    const midpoint = { x: current.x + 0.5 * step * velocity.x, y: current.y + 0.5 * step * velocity.y };
    const midpointP = continuousMomentum(midpoint.x, midpoint.y, current.p);
    const midpointVelocity = normalizedMomentumFlow(midpointP, family, direction);
    if (!midpointVelocity) break;
    const next = {
      x: current.x + step * midpointVelocity.x,
      y: current.y + step * midpointVelocity.y,
    };
    if (next.x < bounds.xMin || next.x > bounds.xMax || next.y < bounds.yMin || next.y > bounds.yMax) break;
    const nextP = continuousMomentum(next.x, next.y, midpointP);
    if (nearMomentumTurningPoint(nextP)) break;
    points.push({ ...next, p: nextP });
    if (index > 40 && Math.hypot(next.x - seed.x, next.y - seed.y) < step * 0.65) break;
  }
  return points;
}

function turningPoints(sign, bounds) {
  const couplingNorm = state.lambda.re * state.lambda.re + state.lambda.im * state.lambda.im;
  if (couplingNorm < 1e-16) return [];
  const target = divideComplex({ re: state.energy.re - sign, im: state.energy.im }, state.lambda);
  const principal = acosComplex(target);
  const points = [];
  for (const branchSign of [1, -1]) {
    for (let period = -4; period <= 4; period += 1) {
      const point = {
        re: branchSign * principal.re + 2 * Math.PI * period,
        im: branchSign * principal.im,
      };
      if (point.re >= bounds.xMin - 1e-8 && point.re <= bounds.xMax + 1e-8 && point.im >= bounds.yMin - 1e-8 && point.im <= bounds.yMax + 1e-8) {
        if (!points.some((other) => Math.hypot(other.re - point.re, other.im - point.im) < 1e-7)) points.push(point);
      }
    }
  }
  return points;
}

function installMomentumRenderer() {
  const canvas = document.getElementById("momentum-plot");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 24, right: 24, bottom: 54, left: 72 };
  const bounds = { xMin: -2 * Math.PI, xMax: 2 * Math.PI, yMin: -3, yMax: 3 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const toX = (value) => margin.left + (value - bounds.xMin) / (bounds.xMax - bounds.xMin) * plotWidth;
  const toY = (value) => margin.top + (bounds.yMax - value) / (bounds.yMax - bounds.yMin) * plotHeight;

  renderMomentum = () => {
    const background = cssColor("--panel-strong");
    const grid = cssColor("--grid");
    const axis = cssColor("--axis");
    const text = cssColor("--muted");
    const contour = cssColor("--contour");
    const solid = cssColor("--orange");
    const plusColor = cssColor("--turn-plus");
    const minusColor = cssColor("--turn-minus");
    const pFlowColor = cssColor("--flow-p");
    const piFlowColor = cssColor("--flow-pi");

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.font = "18px ui-monospace, Consolas, monospace";
    ctx.lineWidth = 1;

    for (let k = -4; k <= 4; k += 1) {
      const value = k * Math.PI / 2;
      const px = toX(value);
      ctx.strokeStyle = Math.abs(value) < 1e-12 ? axis : grid;
      ctx.beginPath(); ctx.moveTo(px, margin.top); ctx.lineTo(px, height - margin.bottom); ctx.stroke();
      ctx.fillStyle = text;
      ctx.textAlign = "center";
      const label = k === 0 ? "0" : k % 2 === 0 ? `${k / 2 === 1 ? "" : k / 2 === -1 ? "−" : k / 2}π` : `${k}π/2`;
      ctx.fillText(label.replace("-", "−"), px, height - margin.bottom + 27);
    }
    for (let value = -3; value <= 3; value += 1) {
      const py = toY(value);
      ctx.strokeStyle = value === 0 ? axis : grid;
      ctx.beginPath(); ctx.moveTo(margin.left, py); ctx.lineTo(width - margin.right, py); ctx.stroke();
      ctx.fillStyle = text;
      ctx.textAlign = "right";
      ctx.fillText(String(value).replace("-", "−"), margin.left - 12, py + 6);
    }
    ctx.textAlign = "right"; ctx.fillText("Re z", width - margin.right, height - 12);
    ctx.textAlign = "left"; ctx.fillText("Im z", 12, 16);

    const drawArrow = (path, color) => {
      if (path.length < 12) return;
      const index = Math.min(path.length - 2, Math.max(1, Math.floor(path.length * 0.62)));
      const first = { x: toX(path[index - 1].x), y: toY(path[index - 1].y) };
      const second = { x: toX(path[index + 1].x), y: toY(path[index + 1].y) };
      const angle = Math.atan2(second.y - first.y, second.x - first.x);
      const center = { x: toX(path[index].x), y: toY(path[index].y) };
      const size = 7;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(center.x + size * Math.cos(angle), center.y + size * Math.sin(angle));
      ctx.lineTo(center.x + size * Math.cos(angle + 2.55), center.y + size * Math.sin(angle + 2.55));
      ctx.lineTo(center.x + size * Math.cos(angle - 2.55), center.y + size * Math.sin(angle - 2.55));
      ctx.closePath();
      ctx.fill();
    };

    const drawFlowFamily = (family, color, dash) => {
      const occupancyColumns = 72;
      const occupancyRows = 36;
      const occupied = new Uint8Array(occupancyColumns * occupancyRows);
      const occupancyIndex = (x, y) => {
        const column = Math.floor((x - bounds.xMin) / (bounds.xMax - bounds.xMin) * occupancyColumns);
        const row = Math.floor((bounds.yMax - y) / (bounds.yMax - bounds.yMin) * occupancyRows);
        if (column < 0 || column >= occupancyColumns || row < 0 || row >= occupancyRows) return -1;
        return row * occupancyColumns + column;
      };
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.35;
      ctx.setLineDash(dash);
      for (let seedY = -2.4; seedY <= 2.4001; seedY += 0.8) {
        for (let seedX = -1.75 * Math.PI; seedX <= 1.7501 * Math.PI; seedX += Math.PI / 2) {
          const seedCell = occupancyIndex(seedX, seedY);
          if (seedCell >= 0 && occupied[seedCell]) continue;
          const backward = traceMomentumFlow({ x: seedX, y: seedY }, family, -1, bounds).reverse();
          const forward = traceMomentumFlow({ x: seedX, y: seedY }, family, 1, bounds);
          const path = backward.slice(0, -1).concat(forward);
          if (path.length < 10) continue;
          ctx.beginPath();
          path.forEach((point, index) => {
            const px = toX(point.x);
            const py = toY(point.y);
            if (index === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          drawArrow(path, color);
          for (let index = 0; index < path.length; index += 5) {
            const cell = occupancyIndex(path[index].x, path[index].y);
            if (cell >= 0) occupied[cell] = 1;
          }
        }
      }
      ctx.setLineDash([]);
    };

    if (state.showPiFlow) drawFlowFamily("pi", piFlowColor, [8, 6]);
    if (state.showPFlow) drawFlowFamily("p", pFlowColor, []);

    const columns = 280;
    const rows = 150;
    const sampleWidth = columns + 1;
    const imaginary = new Float64Array((columns + 1) * (rows + 1));
    const real = new Float64Array((columns + 1) * (rows + 1));
    for (let row = 0; row <= rows; row += 1) {
      const y = bounds.yMax - row / rows * (bounds.yMax - bounds.yMin);
      for (let column = 0; column <= columns; column += 1) {
        const x = bounds.xMin + column / columns * (bounds.xMax - bounds.xMin);
        const value = momentumField(x, y);
        const index = row * sampleWidth + column;
        imaginary[index] = value.im;
        real[index] = value.re;
      }
    }

    const dottedSegments = [];
    const solidSegments = [];
    const interpolateEdge = (columnA, rowA, columnB, rowB) => {
      const indexA = rowA * sampleWidth + columnA;
      const indexB = rowB * sampleWidth + columnB;
      const valueA = imaginary[indexA];
      const valueB = imaginary[indexB];
      if ((valueA >= 0) === (valueB >= 0)) return null;
      const t = valueA / (valueA - valueB);
      return {
        x: columnA + t * (columnB - columnA),
        y: rowA + t * (rowB - rowA),
        h: real[indexA] + t * (real[indexB] - real[indexA]),
      };
    };
    const addSolidPart = (first, second) => {
      const difference = second.h - first.h;
      let lower = 0;
      let upper = 1;
      if (Math.abs(difference) < 1e-13) {
        if (first.h < -1 || first.h > 1) return;
      } else {
        const a = (-1 - first.h) / difference;
        const b = (1 - first.h) / difference;
        lower = Math.max(0, Math.min(a, b));
        upper = Math.min(1, Math.max(a, b));
        if (lower > upper) return;
      }
      const pointAt = (t) => ({ x: first.x + t * (second.x - first.x), y: first.y + t * (second.y - first.y) });
      solidSegments.push([pointAt(lower), pointAt(upper)]);
    };

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const crossings = [
          interpolateEdge(column, row, column + 1, row),
          interpolateEdge(column + 1, row, column + 1, row + 1),
          interpolateEdge(column + 1, row + 1, column, row + 1),
          interpolateEdge(column, row + 1, column, row),
        ];
        const present = crossings.map((point, edge) => point ? { point, edge } : null).filter(Boolean);
        let pairs = [];
        if (present.length === 2) {
          pairs = [[present[0].point, present[1].point]];
        } else if (present.length === 4) {
          const cornerIndex = row * sampleWidth + column;
          const centerValue = (
            imaginary[cornerIndex] + imaginary[cornerIndex + 1] +
            imaginary[cornerIndex + sampleWidth] + imaginary[cornerIndex + sampleWidth + 1]
          ) / 4;
          const cornerMatchesCenter = (imaginary[cornerIndex] >= 0) === (centerValue >= 0);
          pairs = cornerMatchesCenter
            ? [[crossings[0], crossings[1]], [crossings[2], crossings[3]]]
            : [[crossings[0], crossings[3]], [crossings[1], crossings[2]]];
        }
        for (const pair of pairs) {
          dottedSegments.push(pair);
          addSolidPart(pair[0], pair[1]);
        }
      }
    }

    const toCanvasPoint = (point) => ({
      x: margin.left + point.x / columns * plotWidth,
      y: margin.top + point.y / rows * plotHeight,
    });
    ctx.fillStyle = contour;
    ctx.setLineDash([]);
    for (const segment of dottedSegments) {
      const first = toCanvasPoint(segment[0]);
      const second = toCanvasPoint(segment[1]);
      ctx.beginPath();
      ctx.arc((first.x + second.x) / 2, (first.y + second.y) / 2, 1.45, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.strokeStyle = solid;
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const segment of solidSegments) {
      const first = toCanvasPoint(segment[0]);
      const second = toCanvasPoint(segment[1]);
      ctx.moveTo(first.x, first.y); ctx.lineTo(second.x, second.y);
    }
    ctx.stroke();

    const plusPoints = turningPoints(1, bounds);
    const minusPoints = turningPoints(-1, bounds);
    const drawTurningPoints = (points, color) => {
      for (const point of points) {
        ctx.beginPath(); ctx.arc(toX(point.re), toY(point.im), 8, 0, 2 * Math.PI);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = background; ctx.stroke();
      }
    };
    drawTurningPoints(plusPoints, plusColor);
    drawTurningPoints(minusPoints, minusColor);

    canvas.dataset.dottedSegments = String(dottedSegments.length);
    canvas.dataset.solidSegments = String(solidSegments.length);
    canvas.dataset.plusPoints = String(plusPoints.length);
    canvas.dataset.minusPoints = String(minusPoints.length);
    document.getElementById("momentum-energy-display").value = `E = ${formatComplex(state.energy)}`;
    document.getElementById("momentum-lambda-display").value = `λ = ${formatComplex(state.lambda)}`;
  };
}

let momentumTimer = null;
function queueMomentumUpdate(delay = 35) {
  clearTimeout(momentumTimer);
  momentumTimer = setTimeout(() => {
    renderMomentum();
    window.CurveVisualizer?.render(state);
  }, delay);
}

function setStatus(message, kind = "") {
  const status = document.getElementById("compute-status");
  status.textContent = message;
  status.className = `status${kind ? ` ${kind}` : ""}`;
}

function updateSigma() {
  const coupling = state.lambda;
  state.sigma = [
    { re: -coupling.re - 1, im: -coupling.im },
    { re: -coupling.re + 1, im: -coupling.im },
    { re: coupling.re + 1, im: coupling.im },
    { re: coupling.re - 1, im: coupling.im },
  ];
}

async function updateSpectrum() {
  const token = ++computeToken;
  setStatus("Computing…", "is-working");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    if (token !== computeToken || !state.showEigenvalues) return;
    if (!window.SpectrumSolver) throw new Error("The local spectrum solver did not load");
    const result = window.SpectrumSolver.computeSpectrum({
      N: state.n,
      lambdaRe: state.lambda.re,
      lambdaIm: state.lambda.im,
      p0Re: state.p0.re,
      p0Im: state.p0.im,
      x0Re: state.x0.re,
      x0Im: state.x0.im,
    });
    if (token !== computeToken || !state.showEigenvalues) return;
    state.spectrum = result.roots;
    updateSigma();
    state.elapsedMs = result.elapsedMs;
    document.getElementById("timing-detail").value = `${state.n} eigenvalues · ${result.elapsedMs.toFixed(1)} ms`;
    document.getElementById("point-detail").value = "Drag E in the energy plane.";
    setStatus("Up to date");
    renderPlot();
    queueMomentumUpdate();
  } catch (error) {
    setStatus(error.message, "is-error");
  }
}

function queueRefresh(delay = 120) {
  clearTimeout(requestTimer);
  requestTimer = setTimeout(() => {
    updateSigma();
    if (state.showEigenvalues) {
      updateSpectrum();
    } else {
      computeToken += 1;
      state.spectrum = [];
      setStatus("Eigenvalues off");
      document.getElementById("timing-detail").value = "Not computing eigenvalues";
      renderPlot();
      queueMomentumUpdate();
    }
  }, delay);
}

function initialize() {
  Object.keys(configs).forEach((key) => { pads[key] = new ComplexPad(key); });
  const slider = document.getElementById("n-slider");
  const display = document.getElementById("n-display");
  slider.addEventListener("input", () => {
    state.n = Number(slider.value);
    display.value = String(state.n);
    queueRefresh(100);
  });
  installPlotRenderer();
  installMomentumRenderer();
  window.CurveVisualizer?.init(state);

  const eigenvalueToggle = document.getElementById("show-eigenvalues");
  eigenvalueToggle.addEventListener("change", () => {
    state.showEigenvalues = eigenvalueToggle.checked;
    document.getElementById("eigenvalue-legend").hidden = !state.showEigenvalues;
    if (!state.showEigenvalues) {
      clearTimeout(requestTimer);
      computeToken += 1;
      state.spectrum = [];
      setStatus("Eigenvalues off");
      document.getElementById("timing-detail").value = "Not computing eigenvalues";
      renderPlot();
    } else {
      queueRefresh(0);
    }
  });

  const pFlowToggle = document.getElementById("show-p-flow");
  const piFlowToggle = document.getElementById("show-pi-flow");
  pFlowToggle.addEventListener("change", () => {
    state.showPFlow = pFlowToggle.checked;
    renderMomentum();
  });
  piFlowToggle.addEventListener("change", () => {
    state.showPiFlow = piFlowToggle.checked;
    renderMomentum();
  });

  document.getElementById("reset-phases").addEventListener("click", () => {
    state.p0.re = 0; state.p0.im = 0;
    state.x0.re = 0; state.x0.im = 0;
    pads.p0.syncControls();
    pads.x0.syncControls();
    queueRefresh(0);
  });

  document.querySelectorAll(".window-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".window-tab").forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("is-active", selected);
        if (selected) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      document.getElementById("spectrum-window").hidden = tab.dataset.windowTarget !== "spectrum-window";
      document.getElementById("momentum-window").hidden = tab.dataset.windowTarget !== "momentum-window";
      if (tab.dataset.windowTarget === "momentum-window") renderMomentum();
      else renderPlot();
    });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    Object.values(pads).forEach((pad) => pad.draw());
    renderPlot();
    renderMomentum();
    window.CurveVisualizer?.render(state);
  });
  window.addEventListener("sf-view-change", () => {
    requestAnimationFrame(() => {
      Object.values(pads).forEach((pad) => pad.draw());
      renderPlot();
      renderMomentum();
      window.CurveVisualizer?.render(state);
    });
  });
  updateSigma();
  renderMomentum();
  updateSpectrum();
}

initialize();
