"use strict";

window.CurveVisualizer = (() => {
  const view = { yaw: -0.68, pitch: 0.46, zoom: 1, dragging: false, x: 0, y: 0 };
  let currentState = null;
  let frame = null;
  let cachedKey = "";
  let cachedSamples = null;
  let contourStateKey = "";
  const contour = { points: [], drawing: false, drawMode: false, selected: 0 };
  const momentumPlot = {
    width: 1400,
    height: 720,
    margin: { top: 24, right: 24, bottom: 54, left: 72 },
    bounds: { xMin: -2 * Math.PI, xMax: 2 * Math.PI, yMin: -3, yMax: 3 },
  };

  const C = {
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div: (a, b) => {
      const d = b.re * b.re + b.im * b.im;
      return d < 1e-16 ? { re: NaN, im: NaN } : {
        re: (a.re * b.re + a.im * b.im) / d,
        im: (a.im * b.re - a.re * b.im) / d,
      };
    },
    sqrt: (a) => {
      const r = Math.hypot(a.re, a.im);
      return {
        re: Math.sqrt(Math.max(0, (r + a.re) / 2)),
        im: (a.im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - a.re) / 2)),
      };
    },
  };

  function acosC(value) {
    const square = C.mul(value, value);
    const root = C.sqrt({ re: 1 - square.re, im: -square.im });
    const inside = { re: value.re - root.im, im: value.im + root.re };
    return {
      re: Math.atan2(inside.im, inside.re),
      im: -Math.log(Math.max(Math.hypot(inside.re, inside.im), 1e-300)),
    };
  }

  function cosineZ(x, y) {
    return { re: Math.cos(x) * Math.cosh(y), im: -Math.sin(x) * Math.sinh(y) };
  }

  function momentumAt(x, y, sheet, state) {
    const w = C.sub(state.energy, C.mul(state.lambda, cosineZ(x, y)));
    const p = acosC(w);
    return sheet === 1 ? p : { re: -p.re, im: -p.im };
  }

  function nearestMomentumLift(z, previous, state) {
    const principal = momentumAt(z.re, z.im, 1, state);
    if (!previous) return { z, p: principal, sign: 1, winding: 0, principal };
    let best = null;
    for (const sign of [1, -1]) {
      const base = { re: sign * principal.re, im: sign * principal.im };
      const center = Math.round((previous.p.re - base.re) / (2 * Math.PI));
      for (let winding = center - 2; winding <= center + 2; winding += 1) {
        const candidate = { re: base.re + 2 * Math.PI * winding, im: base.im };
        const distanceToPrevious = Math.hypot(candidate.re - previous.p.re, candidate.im - previous.p.im);
        if (!best || distanceToPrevious < best.distance) {
          best = { z, p: candidate, sign, winding, principal, distance: distanceToPrevious };
        }
      }
    }
    return best;
  }

  function rebuildContourLift() {
    let previous = null;
    contour.points = contour.points.map((point) => {
      const lifted = nearestMomentumLift(point.z, previous, currentState);
      previous = lifted;
      return lifted;
    });
    contour.selected = Math.min(contour.selected, Math.max(0, contour.points.length - 1));
  }

  function addContourPoint(z, force = false) {
    const previous = contour.points[contour.points.length - 1];
    if (!force && previous && Math.hypot(z.re - previous.z.re, z.im - previous.z.im) < 0.035) return;
    contour.points.push(nearestMomentumLift(z, previous, currentState));
    contour.selected = contour.points.length - 1;
    updateContourControls();
    drawContourViews();
    render(currentState);
  }

  function wrapPi(value) {
    let result = (value + Math.PI) % (2 * Math.PI);
    if (result < 0) result += 2 * Math.PI;
    return result - Math.PI;
  }

  function colourForPhase(theta, alpha) {
    const hue = ((wrapPi(theta) + Math.PI) / (2 * Math.PI)) * 360;
    return `hsla(${hue.toFixed(1)}, 72%, 53%, ${alpha})`;
  }

  function theme(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function sampleKey(state) {
    return [state.energy.re, state.energy.im, state.lambda.re, state.lambda.im]
      .map((v) => Number(v).toFixed(6)).join("|");
  }

  function buildSamples(state) {
    const key = sampleKey(state);
    if (key === cachedKey && cachedSamples) return cachedSamples;
    const nx = 48;
    const ny = 28;
    const yExtent = 2.4;
    const sheets = [];
    for (const sign of [1, -1]) {
      const rows = [];
      for (let row = 0; row <= ny; row += 1) {
        const y = -yExtent + 2 * yExtent * row / ny;
        const points = [];
        for (let column = 0; column <= nx; column += 1) {
          const x = -Math.PI + 2 * Math.PI * column / nx;
          const p = momentumAt(x, y, sign, state);
          points.push({
            x,
            y,
            thetaP: wrapPi(p.re),
            rhoP: Math.max(-4.5, Math.min(4.5, -p.im)),
          });
        }
        rows.push(points);
      }
      sheets.push({ sign, rows });
    }
    cachedKey = key;
    cachedSamples = { nx, ny, yExtent, sheets };
    return cachedSamples;
  }

  function projectPoint(point, canvas) {
    const a = point.x / Math.PI * 1.45;
    const b = (-point.y) / 2.4 * 1.05;
    const c = point.rhoP / 4.5 * 1.35;
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    const horizontal = a * cy - b * sy;
    const depth0 = a * sy + b * cy;
    const vertical = c * cp - depth0 * sp;
    const depth = c * sp + depth0 * cp;
    const scale = Math.min(canvas.width / 4.15, canvas.height / 3.2) * view.zoom;
    return {
      x: canvas.width * 0.51 + horizontal * scale,
      y: canvas.height * 0.53 - vertical * scale,
      depth,
    };
  }

  function drawSurface(state) {
    const canvas = document.getElementById("curve-surface");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const samples = buildSamples(state);
    const background = theme("--panel-strong");
    const grid = theme("--grid");
    const axis = theme("--axis");
    const text = theme("--muted");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const baseCorners = [
      { x: -Math.PI, y: -2.4, rhoP: 0 }, { x: Math.PI, y: -2.4, rhoP: 0 },
      { x: Math.PI, y: 2.4, rhoP: 0 }, { x: -Math.PI, y: 2.4, rhoP: 0 },
    ].map((point) => projectPoint(point, canvas));
    ctx.strokeStyle = grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    baseCorners.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.stroke();

    const quads = [];
    for (const sheet of samples.sheets) {
      for (let row = 0; row < samples.ny; row += 1) {
        for (let column = 0; column < samples.nx; column += 1) {
          const raw = [
            sheet.rows[row][column], sheet.rows[row][column + 1],
            sheet.rows[row + 1][column + 1], sheet.rows[row + 1][column],
          ];
          const rhoRange = Math.max(...raw.map((p) => p.rhoP)) - Math.min(...raw.map((p) => p.rhoP));
          if (rhoRange > 2.2) continue;
          const projected = raw.map((point) => projectPoint(point, canvas));
          quads.push({
            projected,
            depth: projected.reduce((sum, point) => sum + point.depth, 0) / 4,
            phase: raw.reduce((sum, point) => sum + point.thetaP, 0) / 4,
            sign: sheet.sign,
          });
        }
      }
    }
    quads.sort((a, b) => a.depth - b.depth);
    for (const quad of quads) {
      ctx.beginPath();
      quad.projected.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = colourForPhase(quad.phase, quad.sign === 1 ? 0.18 : 0.11);
      ctx.fill();
      ctx.strokeStyle = colourForPhase(quad.phase, quad.sign === 1 ? 0.48 : 0.32);
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    const lambdaNorm = state.lambda.re * state.lambda.re + state.lambda.im * state.lambda.im;
    if (lambdaNorm > 1e-14) {
      for (const sign of [1, -1]) {
        const target = C.div({ re: state.energy.re - sign, im: state.energy.im }, state.lambda);
        const z = acosC(target);
        for (const branch of [1, -1]) {
          const point = projectPoint({ x: branch * z.re, y: branch * z.im, rhoP: 0 }, canvas);
          ctx.beginPath();
          ctx.arc(point.x, point.y, 7, 0, 2 * Math.PI);
          ctx.fillStyle = sign === 1 ? theme("--turn-plus") : theme("--turn-minus");
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = background;
          ctx.stroke();
        }
      }
    }

    if (contour.points.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      for (let index = 1; index < contour.points.length; index += 1) {
        const previous = contour.points[index - 1];
        const current = contour.points[index];
        const first = projectPoint({ x: previous.z.re, y: previous.z.im, rhoP: -previous.p.im }, canvas);
        const second = projectPoint({ x: current.z.re, y: current.z.im, rhoP: -current.p.im }, canvas);
        ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(second.x, second.y);
        ctx.strokeStyle = colourForPhase((previous.p.re + current.p.re) / 2, 0.96);
        ctx.stroke();
      }
      const selected = contour.points[contour.selected];
      if (selected) {
        const marker = projectPoint({ x: selected.z.re, y: selected.z.im, rhoP: -selected.p.im }, canvas);
        ctx.beginPath(); ctx.arc(marker.x, marker.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = theme("--energy"); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = background; ctx.stroke();
      }
    }

    ctx.fillStyle = text;
    ctx.font = "18px ui-monospace, Consolas, monospace";
    ctx.fillText("Re z (periodic)", 22, canvas.height - 24);
    ctx.fillText("height: −Im p", 22, 30);
    ctx.textAlign = "right";
    ctx.fillText("depth: −Im z", canvas.width - 22, canvas.height - 24);
    ctx.textAlign = "left";
    canvas.dataset.surfaceQuads = String(quads.length);
  }

  function branchData(state) {
    const a = C.div({ re: state.energy.re - 1, im: state.energy.im }, state.lambda);
    const b = C.div({ re: state.energy.re + 1, im: state.energy.im }, state.lambda);
    return [
      { id: "−1", value: { re: -1, im: 0 }, fixed: true },
      { id: "+1", value: { re: 1, im: 0 }, fixed: true },
      { id: "(E−1)/λ", value: a, fixed: false },
      { id: "(E+1)/λ", value: b, fixed: false },
    ];
  }

  function distance(a, b) {
    return Math.hypot(a.value.re - b.value.re, a.value.im - b.value.im);
  }

  function bestPairing(points) {
    const options = [
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
    return options.reduce((best, pairing) => {
      const score = pairing.reduce((sum, pair) => sum + distance(points[pair[0]], points[pair[1]]), 0);
      return !best || score < best.score ? { pairing, score } : best;
    }, null).pairing;
  }

  function segmentIntersection(a, b, c, d) {
    const r = { re: b.re - a.re, im: b.im - a.im };
    const s = { re: d.re - c.re, im: d.im - c.im };
    const cross = (u, v) => u.re * v.im - u.im * v.re;
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-10) return null;
    const offset = { re: c.re - a.re, im: c.im - a.im };
    const alongPath = cross(offset, s) / denominator;
    const alongCut = cross(offset, r) / denominator;
    const epsilon = 1e-7;
    if (alongPath <= epsilon || alongPath > 1 + epsilon || alongCut <= epsilon || alongCut >= 1 - epsilon) return null;
    return {
      alongPath: Math.min(1, alongPath),
      point: { re: a.re + alongPath * r.re, im: a.im + alongPath * r.im },
    };
  }

  function drawBranchCover(state) {
    const canvas = document.getElementById("branch-cover");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const background = theme("--panel-strong");
    const grid = theme("--grid");
    const axis = theme("--axis");
    const text = theme("--muted");
    const fixedColor = theme("--blue");
    const movingColor = theme("--orange");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const points = branchData(state);
    if (points.some((point) => !Number.isFinite(point.value.re) || !Number.isFinite(point.value.im))) {
      ctx.fillStyle = text;
      ctx.font = "20px ui-monospace, Consolas, monospace";
      ctx.fillText("The t-plane cover is singular when λ = 0.", 28, 48);
      return;
    }
    const pairing = bestPairing(points);
    const cuts = pairing.map(([first, second]) => [points[first].value, points[second].value]);
    const contourInT = contour.points.map((point) => cosineZ(point.z.re, point.z.im));
    const allRe = [...points.map((point) => point.value.re), ...contourInT.map((point) => point.re)];
    const allIm = [...points.map((point) => point.value.im), ...contourInT.map((point) => point.im)];
    let minRe = Math.min(...allRe); let maxRe = Math.max(...allRe);
    let minIm = Math.min(...allIm); let maxIm = Math.max(...allIm);
    const span = Math.max(maxRe - minRe, maxIm - minIm, 2.5);
    const centerRe = (minRe + maxRe) / 2;
    const centerIm = (minIm + maxIm) / 2;
    minRe = centerRe - span * 0.62; maxRe = centerRe + span * 0.62;
    minIm = centerIm - span * 0.50; maxIm = centerIm + span * 0.50;

    const gap = 42;
    const panelWidth = (canvas.width - gap - 40) / 2;
    const panelHeight = canvas.height - 78;
    const drawSheet = (left, label) => {
      const top = 44;
      const margin = 32;
      const toX = (v) => left + margin + (v - minRe) / (maxRe - minRe) * (panelWidth - 2 * margin);
      const toY = (v) => top + margin + (maxIm - v) / (maxIm - minIm) * (panelHeight - 2 * margin);
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      ctx.strokeRect(left, top, panelWidth, panelHeight);
      if (minRe <= 0 && maxRe >= 0) {
        ctx.beginPath(); ctx.moveTo(toX(0), top); ctx.lineTo(toX(0), top + panelHeight); ctx.stroke();
      }
      if (minIm <= 0 && maxIm >= 0) {
        ctx.beginPath(); ctx.moveTo(left, toY(0)); ctx.lineTo(left + panelWidth, toY(0)); ctx.stroke();
      }
      ctx.fillStyle = text; ctx.font = "17px ui-monospace, Consolas, monospace";
      ctx.fillText(label, left + 10, 27);
      for (const pair of pairing) {
        const first = points[pair[0]].value;
        const second = points[pair[1]].value;
        ctx.beginPath(); ctx.moveTo(toX(first.re), toY(first.im)); ctx.lineTo(toX(second.re), toY(second.im));
        ctx.strokeStyle = theme("--energy"); ctx.lineWidth = 5; ctx.setLineDash([9, 6]); ctx.stroke(); ctx.setLineDash([]);
      }
      for (const point of points) {
        const x = toX(point.value.re); const y = toY(point.value.im);
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 2 * Math.PI);
        ctx.fillStyle = point.fixed ? fixedColor : movingColor; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = background; ctx.stroke();
        ctx.fillStyle = text; ctx.font = "14px ui-monospace, Consolas, monospace";
        ctx.fillText(point.id, x + 9, y - 8);
      }
      return { left, top, toX, toY };
    };
    const startingSheet = drawSheet(12, "starting sheet");
    const otherSheet = drawSheet(12 + panelWidth + gap, "other sheet");
    const sheets = [startingSheet, otherSheet];
    ctx.fillStyle = axis; ctx.font = "24px system-ui"; ctx.textAlign = "center";
    ctx.fillText("↔", canvas.width / 2, canvas.height / 2);
    ctx.font = "13px ui-monospace, Consolas, monospace";
    ctx.fillText("cross a cut", canvas.width / 2, canvas.height / 2 + 23);
    ctx.textAlign = "left";

    let cutCrossings = 0;
    const sheetSegments = [0, 0];
    if (contour.points.length > 1) {
      let activeSheet = 0;
      const sheetAtPoint = [0];
      const crossingPoints = [];
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const drawPiece = (first, second, sheetIndex, phase) => {
        const sheet = sheets[sheetIndex];
        ctx.beginPath(); ctx.moveTo(sheet.toX(first.re), sheet.toY(first.im)); ctx.lineTo(sheet.toX(second.re), sheet.toY(second.im));
        ctx.strokeStyle = colourForPhase(phase, 0.92); ctx.stroke();
        sheetSegments[sheetIndex] += 1;
      };

      for (let index = 1; index < contour.points.length; index += 1) {
        const first = contourInT[index - 1];
        const second = contourInT[index];
        const hits = cuts
          .map((cut) => segmentIntersection(first, second, cut[0], cut[1]))
          .filter(Boolean)
          .sort((a, b) => a.alongPath - b.alongPath)
          .filter((hit, hitIndex, list) => hitIndex === 0 || Math.abs(hit.alongPath - list[hitIndex - 1].alongPath) > 1e-6);
        let cursor = first;
        const phase = (contour.points[index - 1].p.re + contour.points[index].p.re) / 2;
        for (const hit of hits) {
          drawPiece(cursor, hit.point, activeSheet, phase);
          crossingPoints.push(hit.point);
          activeSheet = 1 - activeSheet;
          cutCrossings += 1;
          cursor = hit.point;
        }
        drawPiece(cursor, second, activeSheet, phase);
        sheetAtPoint[index] = activeSheet;
      }

      for (const crossing of crossingPoints) {
        for (const sheet of sheets) {
          const x = sheet.toX(crossing.re); const y = sheet.toY(crossing.im);
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = theme("--energy"); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
          ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI);
          ctx.strokeStyle = background; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      const start = contourInT[0];
      ctx.beginPath(); ctx.arc(startingSheet.toX(start.re), startingSheet.toY(start.im), 7, 0, 2 * Math.PI);
      ctx.fillStyle = background; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = theme("--text"); ctx.stroke();

      const selectedIndex = Math.min(contour.selected, contourInT.length - 1);
      const selected = contourInT[selectedIndex];
      const selectedSheet = sheets[sheetAtPoint[selectedIndex] || 0];
      ctx.beginPath(); ctx.arc(selectedSheet.toX(selected.re), selectedSheet.toY(selected.im), 8, 0, 2 * Math.PI);
      ctx.fillStyle = theme("--energy"); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = background; ctx.stroke();
    }

    const collisions = [
      [points[0], points[2]], [points[1], points[2]],
      [points[0], points[3]], [points[1], points[3]],
    ].map((pair) => ({ pair, d: distance(pair[0], pair[1]) })).sort((a, b) => a.d - b.d);
    const nearest = collisions[0];
    const status = document.getElementById("curve-fiber-status");
    status.value = nearest.d < 0.035 ? "Degenerating fiber — cycle pinched" : nearest.d < 0.3 ? "Near a corner — short vanishing cycle" : "Smooth genus-one fiber";
    const crossingDetail = contour.points.length > 1 ? ` · path crosses displayed cuts ${cutCrossings} time${cutCrossings === 1 ? "" : "s"}` : "";
    document.getElementById("branch-detail").value = `nearest collision: ${nearest.pair[0].id} ↔ ${nearest.pair[1].id} · distance ${nearest.d.toFixed(3)}${crossingDetail}`;
    canvas.dataset.branchPoints = "4";
    canvas.dataset.nearestCollision = nearest.d.toFixed(6);
    canvas.dataset.cutCrossings = String(cutCrossings);
    canvas.dataset.startingSheetSegments = String(sheetSegments[0]);
    canvas.dataset.otherSheetSegments = String(sheetSegments[1]);
  }

  function drawProjectionAxes(ctx, canvas, xMin, xMax, yMin, yMax, xLabel, yLabel) {
    const margin = { left: 48, right: 14, top: 16, bottom: 38 };
    const width = canvas.width - margin.left - margin.right;
    const height = canvas.height - margin.top - margin.bottom;
    const toX = (v) => margin.left + (v - xMin) / (xMax - xMin) * width;
    const toY = (v) => margin.top + (yMax - v) / (yMax - yMin) * height;
    ctx.strokeStyle = theme("--grid"); ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k += 1) {
      const x = margin.left + width * k / 4;
      const y = margin.top + height * k / 4;
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + width, y); ctx.stroke();
    }
    ctx.strokeStyle = theme("--axis");
    if (xMin <= 0 && xMax >= 0) { ctx.beginPath(); ctx.moveTo(toX(0), margin.top); ctx.lineTo(toX(0), margin.top + height); ctx.stroke(); }
    if (yMin <= 0 && yMax >= 0) { ctx.beginPath(); ctx.moveTo(margin.left, toY(0)); ctx.lineTo(margin.left + width, toY(0)); ctx.stroke(); }
    ctx.fillStyle = theme("--muted"); ctx.font = "14px ui-monospace, Consolas, monospace";
    ctx.fillText(yLabel, 7, 14);
    ctx.textAlign = "right"; ctx.fillText(xLabel, canvas.width - 12, canvas.height - 10); ctx.textAlign = "left";
    return { toX, toY, margin, width, height };
  }

  function drawProjections(state) {
    const amoeba = document.getElementById("amoeba-plot");
    const coamoeba = document.getElementById("coamoeba-plot");
    if (!amoeba || !coamoeba) return;
    const amoebaCtx = amoeba.getContext("2d");
    const coamoebaCtx = coamoeba.getContext("2d");
    for (const [canvas, ctx] of [[amoeba, amoebaCtx], [coamoeba, coamoebaCtx]]) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = theme("--panel-strong"); ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const a = drawProjectionAxes(amoebaCtx, amoeba, -2.4, 2.4, -4.5, 4.5, "−Im z", "−Im p");
    const c = drawProjectionAxes(coamoebaCtx, coamoeba, -Math.PI, Math.PI, -Math.PI, Math.PI, "Re z", "Re p");
    let count = 0;
    for (const sign of [1, -1]) {
      const color = sign === 1 ? theme("--blue") : theme("--orange");
      amoebaCtx.fillStyle = color; coamoebaCtx.fillStyle = color;
      for (let row = 0; row <= 30; row += 1) {
        const y = -2.4 + 4.8 * row / 30;
        for (let column = 0; column <= 52; column += 1) {
          const x = -Math.PI + 2 * Math.PI * column / 52;
          const p = momentumAt(x, y, sign, state);
          const rhoP = Math.max(-4.5, Math.min(4.5, -p.im));
          amoebaCtx.globalAlpha = 0.34;
          amoebaCtx.fillRect(a.toX(-y) - 1.15, a.toY(rhoP) - 1.15, 2.3, 2.3);
          coamoebaCtx.globalAlpha = 0.34;
          coamoebaCtx.fillRect(c.toX(x) - 1.15, c.toY(wrapPi(p.re)) - 1.15, 2.3, 2.3);
          count += 1;
        }
      }
    }
    amoebaCtx.globalAlpha = 1; coamoebaCtx.globalAlpha = 1;
    amoeba.dataset.points = String(count);
    coamoeba.dataset.points = String(count);
  }

  function contourMap() {
    const { width, height, margin, bounds } = momentumPlot;
    return {
      toX: (value) => margin.left + (value - bounds.xMin) / (bounds.xMax - bounds.xMin) * (width - margin.left - margin.right),
      toY: (value) => margin.top + (bounds.yMax - value) / (bounds.yMax - bounds.yMin) * (height - margin.top - margin.bottom),
    };
  }

  function drawContourOverlay() {
    const canvas = document.getElementById("contour-overlay");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!contour.points.length) return;
    const map = contourMap();
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let index = 1; index < contour.points.length; index += 1) {
      const previous = contour.points[index - 1];
      const current = contour.points[index];
      ctx.beginPath(); ctx.moveTo(map.toX(previous.z.re), map.toY(previous.z.im)); ctx.lineTo(map.toX(current.z.re), map.toY(current.z.im));
      ctx.strokeStyle = current.sign === 1 ? theme("--blue") : theme("--orange"); ctx.stroke();
      if (previous.sign !== current.sign || previous.winding !== current.winding) {
        const x = map.toX(current.z.re); const y = map.toY(current.z.im);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = theme("--energy"); ctx.fillRect(-7, -7, 14, 14); ctx.restore();
      }
    }
    const start = contour.points[0];
    ctx.beginPath(); ctx.arc(map.toX(start.z.re), map.toY(start.z.im), 8, 0, 2 * Math.PI);
    ctx.fillStyle = theme("--panel-strong"); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = theme("--text"); ctx.stroke();
    const selected = contour.points[contour.selected];
    if (selected) {
      ctx.beginPath(); ctx.arc(map.toX(selected.z.re), map.toY(selected.z.im), 10, 0, 2 * Math.PI);
      ctx.fillStyle = theme("--energy"); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = theme("--panel-strong"); ctx.stroke();
    }
    canvas.dataset.contourPoints = String(contour.points.length);
  }

  function blankLiftPlot(canvas, message) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme("--panel-strong"); ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme("--muted"); ctx.font = "17px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center"; ctx.fillText(message, canvas.width / 2, canvas.height / 2); ctx.textAlign = "left";
  }

  function paddedRange(values, minimumSpan = 1) {
    let min = Math.min(...values); let max = Math.max(...values);
    const span = Math.max(max - min, minimumSpan);
    const center = (min + max) / 2;
    min = center - span * 0.62; max = center + span * 0.62;
    return { min, max };
  }

  function pathLengths() {
    const lengths = [0];
    for (let index = 1; index < contour.points.length; index += 1) {
      const a = contour.points[index - 1].z; const b = contour.points[index].z;
      lengths.push(lengths[index - 1] + Math.hypot(b.re - a.re, b.im - a.im));
    }
    const total = lengths[lengths.length - 1] || 1;
    return lengths.map((value) => value / total);
  }

  function drawLiftPlane() {
    const canvas = document.getElementById("p-lift-plot");
    if (contour.points.length < 2) { blankLiftPlot(canvas, "Draw a z-contour to create its lift."); return; }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme("--panel-strong"); ctx.fillRect(0, 0, canvas.width, canvas.height);
    const xRange = paddedRange(contour.points.map((point) => point.p.re), 2);
    const yRange = paddedRange(contour.points.map((point) => point.p.im), 2);
    const axes = drawProjectionAxes(ctx, canvas, xRange.min, xRange.max, yRange.min, yRange.max, "Re p", "Im p");
    ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let index = 1; index < contour.points.length; index += 1) {
      const previous = contour.points[index - 1]; const current = contour.points[index];
      ctx.beginPath(); ctx.moveTo(axes.toX(previous.p.re), axes.toY(previous.p.im)); ctx.lineTo(axes.toX(current.p.re), axes.toY(current.p.im));
      ctx.strokeStyle = current.sign === 1 ? theme("--blue") : theme("--orange"); ctx.stroke();
    }
    const start = contour.points[0]; const selected = contour.points[contour.selected];
    ctx.beginPath(); ctx.arc(axes.toX(start.p.re), axes.toY(start.p.im), 7, 0, 2 * Math.PI);
    ctx.fillStyle = theme("--panel-strong"); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = theme("--text"); ctx.stroke();
    ctx.beginPath(); ctx.arc(axes.toX(selected.p.re), axes.toY(selected.p.im), 9, 0, 2 * Math.PI);
    ctx.fillStyle = theme("--energy"); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = theme("--panel-strong"); ctx.stroke();
    canvas.dataset.liftPoints = String(contour.points.length);
  }

  function drawTracePlot() {
    const canvas = document.getElementById("p-trace-plot");
    if (contour.points.length < 2) { blankLiftPlot(canvas, "Re p and Im p will remain continuous here."); return; }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme("--panel-strong"); ctx.fillRect(0, 0, canvas.width, canvas.height);
    const values = contour.points.flatMap((point) => [point.p.re, point.p.im]);
    const range = paddedRange(values, 2);
    const axes = drawProjectionAxes(ctx, canvas, 0, 1, range.min, range.max, "s", "p");
    const lengths = pathLengths();
    for (let index = 1; index < contour.points.length; index += 1) {
      const previous = contour.points[index - 1]; const current = contour.points[index];
      if (previous.sign !== current.sign || previous.winding !== current.winding) {
        const x = axes.toX(lengths[index]);
        ctx.beginPath(); ctx.moveTo(x, axes.margin.top); ctx.lineTo(x, axes.margin.top + axes.height);
        ctx.setLineDash([6, 6]); ctx.strokeStyle = theme("--energy"); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const drawSeries = (part, color) => {
      ctx.beginPath();
      contour.points.forEach((point, index) => {
        const x = axes.toX(lengths[index]); const y = axes.toY(point.p[part]);
        if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
    };
    drawSeries("re", theme("--blue"));
    drawSeries("im", theme("--orange"));
    const selected = contour.points[contour.selected]; const selectedX = axes.toX(lengths[contour.selected]);
    ctx.beginPath(); ctx.moveTo(selectedX, axes.margin.top); ctx.lineTo(selectedX, axes.margin.top + axes.height);
    ctx.strokeStyle = theme("--axis"); ctx.lineWidth = 2; ctx.stroke();
    for (const [part, color] of [["re", theme("--blue")], ["im", theme("--orange")]]) {
      ctx.beginPath(); ctx.arc(selectedX, axes.toY(selected.p[part]), 7, 0, 2 * Math.PI);
      ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = theme("--panel-strong"); ctx.stroke();
    }
    ctx.fillStyle = theme("--muted"); ctx.font = "14px ui-monospace, Consolas, monospace";
    ctx.fillText("Re p", 54, 29); ctx.fillStyle = theme("--blue"); ctx.fillRect(98, 20, 22, 4);
    ctx.fillStyle = theme("--muted"); ctx.fillText("Im p", 135, 29); ctx.fillStyle = theme("--orange"); ctx.fillRect(179, 20, 22, 4);
    canvas.dataset.tracePoints = String(contour.points.length);
  }

  function formatPair(value) {
    const sign = value.im < 0 ? "−" : "+";
    return `${value.re.toFixed(3)} ${sign} ${Math.abs(value.im).toFixed(3)}i`;
  }

  function contourSummary() {
    if (contour.points.length < 2) return "No contour drawn.";
    const start = contour.points[0]; const end = contour.points[contour.points.length - 1];
    const closed = Math.hypot(end.z.re - start.z.re, end.z.im - start.z.im) < 0.08;
    const changes = contour.points.slice(1).filter((point, index) => {
      const previous = contour.points[index];
      return point.sign !== previous.sign || point.winding !== previous.winding;
    }).length;
    if (!closed) return `Open contour · ${changes} principal-chart relabelling${changes === 1 ? "" : "s"}`;
    const directK = Math.round((end.p.re - start.p.re) / (2 * Math.PI));
    const switchedK = Math.round((end.p.re + start.p.re) / (2 * Math.PI));
    const directDistance = Math.hypot(end.p.re - start.p.re - 2 * Math.PI * directK, end.p.im - start.p.im);
    const switchedDistance = Math.hypot(end.p.re + start.p.re - 2 * Math.PI * switchedK, end.p.im + start.p.im);
    return switchedDistance < directDistance
      ? `Closed contour · sheets exchanged: p₁ ≈ −p₀ + 2π(${switchedK})`
      : `Closed contour · same sheet: p₁ ≈ p₀ + 2π(${directK})`;
  }

  function updateContourControls() {
    const hasContour = contour.points.length > 0;
    const clearButton = document.getElementById("clear-contour");
    const slider = document.getElementById("contour-progress");
    clearButton.disabled = !hasContour;
    slider.disabled = contour.points.length < 2;
    slider.value = contour.points.length < 2 ? "0" : String(Math.round(contour.selected / (contour.points.length - 1) * 1000));
    const selected = contour.points[contour.selected];
    document.getElementById("lifted-point-detail").value = selected
      ? `z = ${formatPair(selected.z)} · p = ${formatPair(selected.p)} · chart ${selected.sign > 0 ? "+" : "−"}p + 2π(${selected.winding})`
      : "No contour drawn.";
    document.getElementById("contour-draw-status").textContent = contour.drawing ? "Drawing…" : contourSummary();
  }

  function drawContourViews() {
    drawContourOverlay();
    drawLiftPlane();
    drawTracePlot();
    updateContourControls();
  }

  function zFromPointer(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    const { margin, bounds, width, height } = momentumPlot;
    if (x < margin.left || x > width - margin.right || y < margin.top || y > height - margin.bottom) return null;
    return {
      re: bounds.xMin + (x - margin.left) / (width - margin.left - margin.right) * (bounds.xMax - bounds.xMin),
      im: bounds.yMax - (y - margin.top) / (height - margin.top - margin.bottom) * (bounds.yMax - bounds.yMin),
    };
  }

  function setDrawMode(enabled) {
    contour.drawMode = enabled;
    const button = document.getElementById("draw-contour");
    const overlay = document.getElementById("contour-overlay");
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Drawing enabled" : "Draw contour";
    overlay.classList.toggle("is-drawing", enabled);
    document.getElementById("contour-draw-status").textContent = enabled ? "Drag in the z-plane to begin a new contour." : contourSummary();
  }

  function drawAll() {
    frame = null;
    if (!currentState) return;
    drawSurface(currentState);
    drawBranchCover(currentState);
    drawProjections(currentState);
    drawContourViews();
  }

  function render(state) {
    currentState = state;
    const nextKey = sampleKey(state);
    if (contour.points.length && contourStateKey && nextKey !== contourStateKey) rebuildContourLift();
    contourStateKey = nextKey;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(drawAll);
  }

  function init(state) {
    currentState = state;
    const canvas = document.getElementById("curve-surface");
    canvas.addEventListener("pointerdown", (event) => {
      view.dragging = true; view.x = event.clientX; view.y = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!view.dragging) return;
      view.yaw += (event.clientX - view.x) * 0.008;
      view.pitch = Math.max(-1.15, Math.min(1.15, view.pitch + (event.clientY - view.y) * 0.006));
      view.x = event.clientX; view.y = event.clientY;
      render(currentState);
    });
    canvas.addEventListener("pointerup", (event) => {
      view.dragging = false; canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointercancel", () => { view.dragging = false; });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      view.zoom = Math.max(0.65, Math.min(1.7, view.zoom * Math.exp(-event.deltaY * 0.001)));
      render(currentState);
    }, { passive: false });
    document.getElementById("reset-curve-view").addEventListener("click", () => {
      view.yaw = -0.68; view.pitch = 0.46; view.zoom = 1; render(currentState);
    });

    const overlay = document.getElementById("contour-overlay");
    document.getElementById("draw-contour").addEventListener("click", () => setDrawMode(!contour.drawMode));
    document.getElementById("clear-contour").addEventListener("click", () => {
      contour.points = []; contour.selected = 0; contour.drawing = false;
      drawContourViews(); render(currentState);
    });
    overlay.addEventListener("pointerdown", (event) => {
      if (!contour.drawMode) return;
      const z = zFromPointer(event, overlay);
      if (!z) return;
      contour.points = []; contour.selected = 0; contour.drawing = true;
      contourStateKey = sampleKey(currentState);
      overlay.setPointerCapture(event.pointerId);
      addContourPoint(z, true);
    });
    overlay.addEventListener("pointermove", (event) => {
      if (!contour.drawing) return;
      const z = zFromPointer(event, overlay);
      if (z) addContourPoint(z);
    });
    const finishDrawing = (event) => {
      if (!contour.drawing) return;
      contour.drawing = false;
      if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
      if (contour.points.length > 3) {
        const first = contour.points[0].z; const last = contour.points[contour.points.length - 1].z;
        if (Math.hypot(last.re - first.re, last.im - first.im) < 0.28) addContourPoint({ ...first }, true);
      }
      setDrawMode(false);
      drawContourViews(); render(currentState);
    };
    overlay.addEventListener("pointerup", finishDrawing);
    overlay.addEventListener("pointercancel", finishDrawing);
    document.getElementById("contour-progress").addEventListener("input", (event) => {
      if (contour.points.length < 2) return;
      contour.selected = Math.round(Number(event.target.value) / 1000 * (contour.points.length - 1));
      drawContourViews(); render(currentState);
    });
    updateContourControls();
    render(state);
  }

  return { init, render };
})();
