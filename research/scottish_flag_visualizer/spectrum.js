// Adapted from https://ioltman.github.io/spectrum.js.
// Computes the spectrum of H^N_{p0,x0,lambda}, the N x N matrix
//   (H u)_n = (1/2)(e^{-i p0} u_{n+1} + e^{i p0} u_{n-1}) + lambda*cos(2*pi*n/N + x0) u_n,
// with periodic indices mod N (Klopp-Oltman, "The Spectrum of the Discrete Mathieu
// Operator with Non-Real Coupling", eq. (1.2)/(H^N_{p0,x0,lambda})).
//
// Builds the dense complex matrix directly and diagonalizes it with the standard
// Hessenberg + shifted-QR algorithm (complex arithmetic throughout, so a single
// complex shift per step suffices -- no real double-shift trick needed).

(function (global) {
  'use strict';

  function buildOperatorMatrix(N, lambdaRe, lambdaIm, p0Re, p0Im, x0Re, x0Im) {
    const reA = new Float64Array(N * N);
    const imA = new Float64Array(N * N);

    // e^{+i p0} and e^{-i p0} for complex p0 = p0Re + i*p0Im
    const ipRe = -p0Im, ipIm = p0Re; // i*p0
    const ep = Math.exp(ipRe);
    const epRe = ep * Math.cos(ipIm), epIm = ep * Math.sin(ipIm); // e^{i p0}
    const emRe = 1 / ep * Math.cos(-ipIm), emIm = 1 / ep * Math.sin(-ipIm); // e^{-i p0}
    const hopUpRe = 0.5 * emRe, hopUpIm = 0.5 * emIm; // coefficient of u_{n+1}
    const hopDnRe = 0.5 * epRe, hopDnIm = 0.5 * epIm; // coefficient of u_{n-1}

    for (let n = 0; n < N; n++) {
      const theta = (2 * Math.PI * n) / N + x0Re;
      // cos(theta + i*x0Im) = cos(theta)cosh(x0Im) - i*sin(theta)sinh(x0Im)
      const cosRe = Math.cos(theta) * Math.cosh(x0Im);
      const cosIm = -Math.sin(theta) * Math.sinh(x0Im);
      const diagRe = lambdaRe * cosRe - lambdaIm * cosIm;
      const diagIm = lambdaRe * cosIm + lambdaIm * cosRe;

      reA[n * N + n] = diagRe;
      imA[n * N + n] = diagIm;

      const np1 = (n + 1) % N;
      const nm1 = (n - 1 + N) % N;
      reA[n * N + np1] += hopUpRe;
      imA[n * N + np1] += hopUpIm;
      reA[n * N + nm1] += hopDnRe;
      imA[n * N + nm1] += hopDnIm;
    }
    return { reA, imA, N };
  }

  // --- Complex Hessenberg reduction via Householder reflections ---
  function toHessenberg(reA, imA, N) {
    for (let k = 0; k < N - 2; k++) {
      const m = k + 1;
      const L = N - m;
      let normSq = 0;
      for (let t = 0; t < L; t++) {
        const re = reA[(m + t) * N + k], im = imA[(m + t) * N + k];
        normSq += re * re + im * im;
      }
      const norm = Math.sqrt(normSq);
      if (norm < 1e-300) continue;

      const x0re = reA[m * N + k], x0im = imA[m * N + k];
      const x0abs = Math.hypot(x0re, x0im);
      let alphaRe, alphaIm;
      if (x0abs < 1e-300) {
        alphaRe = -norm; alphaIm = 0;
      } else {
        alphaRe = (-norm * x0re) / x0abs;
        alphaIm = (-norm * x0im) / x0abs;
      }

      const vRe = new Float64Array(L), vIm = new Float64Array(L);
      vRe[0] = x0re - alphaRe; vIm[0] = x0im - alphaIm;
      for (let t = 1; t < L; t++) {
        vRe[t] = reA[(m + t) * N + k];
        vIm[t] = imA[(m + t) * N + k];
      }
      let vNormSq = 0;
      for (let t = 0; t < L; t++) vNormSq += vRe[t] * vRe[t] + vIm[t] * vIm[t];
      if (vNormSq < 1e-300) continue;

      applyHouseholderSimilarity(reA, imA, N, m, vRe, vIm, vNormSq);
    }
  }

  // P = I - 2 v v^H / (v^H v) acting on rows/cols [m, N-1]; applies A := P A P
  function applyHouseholderSimilarity(reA, imA, N, m, vRe, vIm, vNormSq) {
    const L = vRe.length;
    const scale = 2 / vNormSq;

    // Left: A[m..N-1][*] -= scale * v * (v^H * A[m..N-1][*])
    for (let j = 0; j < N; j++) {
      let sRe = 0, sIm = 0;
      for (let t = 0; t < L; t++) {
        const aRe = reA[(m + t) * N + j], aIm = imA[(m + t) * N + j];
        // conj(v[t]) * a
        sRe += vRe[t] * aRe + vIm[t] * aIm;
        sIm += vRe[t] * aIm - vIm[t] * aRe;
      }
      sRe *= scale; sIm *= scale;
      for (let t = 0; t < L; t++) {
        const idx = (m + t) * N + j;
        // a -= v[t] * s
        reA[idx] -= vRe[t] * sRe - vIm[t] * sIm;
        imA[idx] -= vRe[t] * sIm + vIm[t] * sRe;
      }
    }

    // Right: A[*][m..N-1] -= scale * (A[*][m..N-1] * v) * v^H
    for (let i = 0; i < N; i++) {
      let sRe = 0, sIm = 0;
      for (let t = 0; t < L; t++) {
        const aRe = reA[i * N + (m + t)], aIm = imA[i * N + (m + t)];
        sRe += aRe * vRe[t] - aIm * vIm[t];
        sIm += aRe * vIm[t] + aIm * vRe[t];
      }
      sRe *= scale; sIm *= scale;
      for (let t = 0; t < L; t++) {
        const idx = i * N + (m + t);
        // a -= s * conj(v[t])
        reA[idx] -= sRe * vRe[t] + sIm * vIm[t];
        imA[idx] -= sIm * vRe[t] - sRe * vIm[t];
      }
    }
  }

  // Complex Givens rotation zeroing b: returns {c (real), sRe, sIm, rRe, rIm}
  function givens(aRe, aIm, bRe, bIm) {
    const absa = Math.hypot(aRe, aIm);
    const absb = Math.hypot(bRe, bIm);
    if (absa < 1e-300) {
      if (absb < 1e-300) return { c: 1, sRe: 0, sIm: 0, rRe: aRe, rIm: aIm };
      return { c: 0, sRe: bRe / absb, sIm: bIm / absb, rRe: bRe, rIm: bIm };
    }
    const norm = Math.hypot(absa, absb);
    const c = absa / norm;
    // s = a * conj(b) / (absa * norm)
    const sRe = (aRe * bRe + aIm * bIm) / (absa * norm);
    const sIm = (aIm * bRe - aRe * bIm) / (absa * norm);
    // r = a * norm / absa
    const rRe = (aRe * norm) / absa;
    const rIm = (aIm * norm) / absa;
    return { c, sRe, sIm, rRe, rIm };
  }

  // One implicit shifted-QR step on the active Hessenberg block H[0..hi][0..hi]
  // (assumes rows/cols above `hi` are already deflated and untouched).
  function qrStep(reA, imA, N, hi, muRe, muIm) {
    for (let i = 0; i <= hi; i++) { reA[i * N + i] -= muRe; imA[i * N + i] -= muIm; }

    const rots = [];
    for (let i = 0; i < hi; i++) {
      const aRe = reA[i * N + i], aIm = imA[i * N + i];
      const bRe = reA[(i + 1) * N + i], bIm = imA[(i + 1) * N + i];
      const g = givens(aRe, aIm, bRe, bIm);
      rots.push(g);
      // Apply G to rows i, i+1 (all columns j >= i, but full range is simplest/safe)
      for (let j = 0; j < N; j++) {
        const r1Re = reA[i * N + j], r1Im = imA[i * N + j];
        const r2Re = reA[(i + 1) * N + j], r2Im = imA[(i + 1) * N + j];
        // new row i = c*r1 + s*r2
        reA[i * N + j] = g.c * r1Re + (g.sRe * r2Re - g.sIm * r2Im);
        imA[i * N + j] = g.c * r1Im + (g.sRe * r2Im + g.sIm * r2Re);
        // new row i+1 = -conj(s)*r1 + c*r2
        reA[(i + 1) * N + j] = -(g.sRe * r1Re + g.sIm * r1Im) + g.c * r2Re;
        imA[(i + 1) * N + j] = -(g.sRe * r1Im - g.sIm * r1Re) + g.c * r2Im;
      }
    }

    // Accumulate H := R * Q, Q = G_0^H G_1^H ... G_{hi-1}^H applied on the right in order.
    // G^H = [[c,-s],[conj(s),c]], so right-multiplying columns (i,i+1) by G^H gives:
    for (let i = 0; i < hi; i++) {
      const g = rots[i];
      for (let r = 0; r < N; r++) {
        const c1Re = reA[r * N + i], c1Im = imA[r * N + i];
        const c2Re = reA[r * N + (i + 1)], c2Im = imA[r * N + (i + 1)];
        // new col i = c*c1 + conj(s)*c2
        reA[r * N + i] = g.c * c1Re + (g.sRe * c2Re + g.sIm * c2Im);
        imA[r * N + i] = g.c * c1Im + (g.sRe * c2Im - g.sIm * c2Re);
        // new col i+1 = -s*c1 + c*c2
        reA[r * N + (i + 1)] = (-g.sRe * c1Re + g.sIm * c1Im) + g.c * c2Re;
        imA[r * N + (i + 1)] = (-g.sRe * c1Im - g.sIm * c1Re) + g.c * c2Im;
      }
    }

    for (let i = 0; i <= hi; i++) { reA[i * N + i] += muRe; imA[i * N + i] += muIm; }
  }

  // Eigenvalues of a 2x2 complex block via the quadratic formula.
  function eig2x2(reA, imA, N, i) {
    const aRe = reA[i * N + i], aIm = imA[i * N + i];
    const bRe = reA[i * N + (i + 1)], bIm = imA[i * N + (i + 1)];
    const cRe = reA[(i + 1) * N + i], cIm = imA[(i + 1) * N + i];
    const dRe = reA[(i + 1) * N + (i + 1)], dIm = imA[(i + 1) * N + (i + 1)];
    // trace tr = a+d, det = ad-bc; eigenvalues = (tr +- sqrt(tr^2-4det))/2
    const trRe = aRe + dRe, trIm = aIm + dIm;
    const adRe = aRe * dRe - aIm * dIm, adIm = aRe * dIm + aIm * dRe;
    const bcRe = bRe * cRe - bIm * cIm, bcIm = bRe * cIm + bIm * cRe;
    const detRe = adRe - bcRe, detIm = adIm - bcIm;
    const tr2Re = trRe * trRe - trIm * trIm, tr2Im = 2 * trRe * trIm;
    const discRe = tr2Re - 4 * detRe, discIm = tr2Im - 4 * detIm;
    const s = csqrt(discRe, discIm);
    return [
      { re: (trRe + s.re) / 2, im: (trIm + s.im) / 2 },
      { re: (trRe - s.re) / 2, im: (trIm - s.im) / 2 },
    ];
  }

  function csqrt(re, im) {
    const r = Math.hypot(re, im);
    const sre = Math.sqrt((r + re) / 2);
    let sim = Math.sqrt((r - re) / 2);
    if (im < 0) sim = -sim;
    return { re: sre, im: sim };
  }

  function eigenvalues(reA0, imA0, N) {
    const reA = reA0.slice();
    const imA = imA0.slice();
    toHessenberg(reA, imA, N);

    const result = [];
    let hi = N - 1;
    let iterSinceProgress = 0;
    const maxIter = 60 * N + 200;
    let totalIter = 0;

    while (hi >= 0) {
      if (hi === 0) {
        result.push({ re: reA[0], im: imA[0] });
        hi -= 1;
        continue;
      }

      const subRe = reA[hi * N + (hi - 1)], subIm = imA[hi * N + (hi - 1)];
      const scale = Math.hypot(reA[(hi - 1) * N + (hi - 1)], imA[(hi - 1) * N + (hi - 1)]) +
                    Math.hypot(reA[hi * N + hi], imA[hi * N + hi]) + 1e-300;
      if (Math.hypot(subRe, subIm) < 1e-13 * scale) {
        result.push({ re: reA[hi * N + hi], im: imA[hi * N + hi] });
        reA[hi * N + (hi - 1)] = 0; imA[hi * N + (hi - 1)] = 0;
        hi -= 1;
        iterSinceProgress = 0;
        continue;
      }

      if (hi === 1) {
        const pair = eig2x2(reA, imA, N, 0);
        result.push(pair[0], pair[1]);
        hi -= 2;
        iterSinceProgress = 0;
        continue;
      }
      const sub2Re = reA[(hi - 1) * N + (hi - 2)], sub2Im = imA[(hi - 1) * N + (hi - 2)];
      const scale2 = Math.hypot(reA[(hi - 2) * N + (hi - 2)], imA[(hi - 2) * N + (hi - 2)]) +
                     Math.hypot(reA[(hi - 1) * N + (hi - 1)], imA[(hi - 1) * N + (hi - 1)]) + 1e-300;
      if (Math.hypot(sub2Re, sub2Im) < 1e-13 * scale2) {
        const pair = eig2x2(reA, imA, N, hi - 1);
        result.push(pair[0], pair[1]);
        hi -= 2;
        iterSinceProgress = 0;
        continue;
      }

      // Wilkinson-style shift: eigenvalue of trailing 2x2 closest to H[hi][hi]
      const pair = eig2x2(reA, imA, N, hi - 1);
      const d0Re = pair[0].re - reA[hi * N + hi], d0Im = pair[0].im - imA[hi * N + hi];
      const d1Re = pair[1].re - reA[hi * N + hi], d1Im = pair[1].im - imA[hi * N + hi];
      const use0 = Math.hypot(d0Re, d0Im) <= Math.hypot(d1Re, d1Im);
      let muRe = use0 ? pair[0].re : pair[1].re;
      let muIm = use0 ? pair[0].im : pair[1].im;

      totalIter++;
      iterSinceProgress++;
      if (iterSinceProgress > 0 && iterSinceProgress % 12 === 0) {
        // exceptional shift to break rare stagnation
        muRe = reA[hi * N + hi] + Math.hypot(subRe, subIm) * 0.75;
        muIm = imA[hi * N + hi];
      }
      if (totalIter > maxIter) {
        // give up gracefully: return diagonal entries of remaining block
        for (let i = 0; i <= hi; i++) result.push({ re: reA[i * N + i], im: imA[i * N + i] });
        hi = -1;
        break;
      }

      qrStep(reA, imA, N, hi, muRe, muIm);
    }

    return result;
  }

  function computeSpectrum(opts) {
    const N = opts.N;
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const { reA, imA } = buildOperatorMatrix(
      N,
      opts.lambdaRe || 0, opts.lambdaIm || 0,
      opts.p0Re || 0, opts.p0Im || 0,
      opts.x0Re || 0, opts.x0Im || 0
    );
    const roots = eigenvalues(reA, imA, N);
    const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    return { roots, elapsedMs: t1 - t0 };
  }

  global.SpectrumSolver = { computeSpectrum, buildOperatorMatrix, eigenvalues };
})(typeof window !== 'undefined' ? window : globalThis);
