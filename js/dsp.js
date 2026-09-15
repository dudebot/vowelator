import { createFft } from "./fft.js";

export const ANALYSIS_RATE = 16000;
export const FFT_SIZE = 512;
export const HOP = 160; // 10 ms at 16 kHz
export const LIFTER = 22;

function lowpassTaps(taps, cutoff, sr) {
  const mid = (taps - 1) / 2;
  const wc = (2 * Math.PI * cutoff) / sr;
  const h = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - mid;
    const sinc = n === 0 ? wc / Math.PI : Math.sin(wc * n) / (Math.PI * n);
    const ham = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1));
    h[i] = sinc * ham;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}

export function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const last = input.length - 1;
  if (Math.abs(ratio - Math.round(ratio)) < 1e-9 && ratio >= 2) {
    const r = Math.round(ratio);
    const taps = lowpassTaps(31, toRate * 0.45, fromRate);
    const half = (taps.length / 2) | 0;
    const outLen = Math.max(1, Math.floor(input.length / r));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const center = i * r;
      let s = 0;
      for (let k = 0; k < taps.length; k++) {
        const idx = center + k - half;
        s += (idx >= 0 && idx <= last ? input[idx] : 0) * taps[k];
      }
      out[i] = s;
    }
    return out;
  }
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.min(last, x | 0);
    const i1 = Math.min(last, i0 + 1);
    const f = x - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

export function downmix(audioBuffer) {
  const n = audioBuffer.length;
  const ch = audioBuffer.numberOfChannels;
  if (ch === 1) return audioBuffer.getChannelData(0).slice();
  const out = new Float32Array(n);
  const inv = 1 / ch;
  for (let c = 0; c < ch; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i] * inv;
  }
  return out;
}

function hamming(n) {
  const w = new Float32Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

function peakInterp(y0, y1, y2) {
  const denom = 2 * (2 * y1 - y0 - y2);
  if (Math.abs(denom) < 1e-12) return 0;
  return (y2 - y0) / denom;
}

function strongestIn(peaks, lo, hi) {
  let best = null;
  for (const p of peaks) {
    if (p.hz < lo || p.hz > hi) continue;
    if (!best || p.mag > best.mag) best = p;
  }
  return best;
}

function levinson(r, order) {
  const a = new Float32Array(order + 1);
  a[0] = 1;
  let e = r[0];
  if (e <= 1e-12) return a;
  const next = new Float32Array(order + 1);
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    next[0] = 1;
    next[i] = k;
    for (let j = 1; j < i; j++) next[j] = a[j] + k * a[i - j];
    a.set(next.subarray(0, i + 1));
    e *= 1 - k * k;
    if (e <= 1e-12) break;
  }
  return a;
}

function lpcEnvelope(frame, order, nFft, fft, re, im) {
  const n = frame.length;
  const r = new Float32Array(order + 1);
  for (let lag = 0; lag <= order; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += frame[i] * frame[i + lag];
    r[lag] = s;
  }
  const a = levinson(r, order);
  re.fill(0);
  im.fill(0);
  re[0] = a[0];
  for (let i = 1; i <= order && i < nFft; i++) re[i] = a[i];
  fft.forward(re, im);
  const env = new Float32Array(nFft / 2);
  for (let k = 0; k < env.length; k++) {
    const mag = Math.hypot(re[k], im[k]) + 1e-12;
    env[k] = 1 / mag;
  }
  return env;
}

function pickFormants(envelope, sr, n) {
  const binHz = sr / n;
  const i0 = Math.max(2, Math.round(160 / binHz));
  const i1 = Math.min(n / 2 - 2, Math.round(3600 / binHz));
  const peaks = [];
  for (let i = i0; i <= i1; i++) {
    if (envelope[i] > envelope[i - 1] && envelope[i] >= envelope[i + 1]) {
      const d = peakInterp(envelope[i - 1], envelope[i], envelope[i + 1]);
      peaks.push({ hz: (i + d) * binHz, mag: envelope[i] });
    }
  }
  const p1 = strongestIn(peaks, 200, 950);
  const f1 = p1?.hz || 0;
  const p2 = strongestIn(peaks, Math.max(f1 + 200, 600), 2400);
  const f2 = p2?.hz || 0;
  const p3 = strongestIn(peaks, Math.max(f2 + 150, 1550), 3600);
  const f3 = p3?.hz || 0;
  return { f1, f2, f3 };
}

/** Close 1-frame silence holes inside a vowel, never promote frication. */
function fillTinySilenceHoles(kind, reject, radius) {
  const n = kind.length;
  const tmp = new Uint8Array(kind);
  for (let i = 0; i < n; i++) {
    if (tmp[i] !== 0 || reject[i]) continue;
    let vowelNeighbors = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
      if (j !== i && tmp[j] === 2) vowelNeighbors++;
    }
    if (vowelNeighbors >= 2) kind[i] = 2;
  }
}

/**
 * Frame-level analysis at 16 kHz.
 * Voicing from cepstral pitch peak; formants from liftered spectral envelope.
 */
export function analyze(samples, sampleRate, onProgress) {
  const x = resampleLinear(samples, sampleRate, ANALYSIS_RATE);
  const n = FFT_SIZE;
  const fft = createFft(n);
  const window = hamming(n);
  const nFrames = Math.max(0, 1 + Math.floor((x.length - n) / HOP));

  const energy = new Float32Array(nFrames);
  const flatness = new Float32Array(nFrames);
  const voiced = new Uint8Array(nFrames);
  const f0 = new Float32Array(nFrames);
  const f1 = new Float32Array(nFrames);
  const f2 = new Float32Array(nFrames);
  const f3 = new Float32Array(nFrames);
  const centroid = new Float32Array(nFrames);
  const hnr = new Float32Array(nFrames);
  const sibilance = new Float32Array(nFrames);
  const highBand = new Float32Array(nFrames);
  const zcr = new Float32Array(nFrames);
  const reject = new Uint8Array(nFrames);

  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const logMag = new Float32Array(n);
  const frame = new Float32Array(n);
  const lpcOrder = 16;
  const binHz = ANALYSIS_RATE / n;
  const qMin = Math.round(ANALYSIS_RATE / 420);
  const qMax = Math.min(n / 2 - 1, Math.round(ANALYSIS_RATE / 65));
  const highBin = Math.max(2, Math.round(4000 / binHz));

  // Center each analysis window on the hop it labels, so a frame at t
  // is not actually looking 16 ms later.
  const winCenter = (n / 2) | 0;
  for (let fi = 0; fi < nFrames; fi++) {
    const off = fi * HOP + (HOP >> 1) - winCenter;
    re.fill(0);
    im.fill(0);
    let rawE = 0;
    let crossings = 0;
    let prevS = 0;
    for (let i = 0; i < n; i++) {
      const idx = off + i;
      const s = idx >= 0 && idx < x.length ? x[idx] : 0;
      rawE += s * s;
      if (i && (s >= 0) !== (prevS >= 0)) crossings++;
      prevS = s;
      re[i] = s * window[i];
    }
    energy[fi] = rawE / n;
    zcr[fi] = crossings / n;
    fft.forward(re, im);

    let sumMag = 0;
    let sumLog = 0;
    let weighted = 0;
    let high = 0;
    let totalP = 0;
    const half = n / 2;
    for (let k = 0; k < half; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      totalP += p;
      if (k >= highBin) high += p;
      const m = Math.sqrt(p);
      if (k > 0) {
        sumMag += m;
        sumLog += Math.log(m + 1e-12);
        weighted += m * k * binHz;
      }
      logMag[k] = Math.log(m + 1e-12);
    }
    logMag[half] = Math.log(Math.hypot(re[half], im[half]) + 1e-12);
    for (let k = 1; k < half; k++) logMag[n - k] = logMag[k];

    const bins = half - 1;
    flatness[fi] = sumMag > 0 ? Math.exp(sumLog / bins) / (sumMag / bins) : 1;
    centroid[fi] = sumMag > 0 ? weighted / sumMag : 0;
    sibilance[fi] = totalP > 0 ? high / totalP : 0;
    highBand[fi] = high / n;

    re.set(logMag);
    im.fill(0);
    fft.inverse(re, im);

    let bestQ = 0;
    let bestC = -Infinity;
    for (let q = qMin; q <= qMax; q++) {
      const c = re[q];
      if (c > bestC) {
        bestC = c;
        bestQ = q;
      }
    }
    hnr[fi] = bestC;
    f0[fi] = bestQ > 0 ? ANALYSIS_RATE / bestQ : 0;

    let prev = off > 0 && off - 1 < x.length ? x[off - 1] : 0;
    for (let i = 0; i < n; i++) {
      const idx = off + i;
      const s = idx >= 0 && idx < x.length ? x[idx] : 0;
      const pre = s - 0.97 * prev;
      prev = s;
      frame[i] = pre * window[i];
    }
    const env = lpcEnvelope(frame, lpcOrder, n, fft, re, im);
    const formants = pickFormants(env, ANALYSIS_RATE, n);
    f1[fi] = formants.f1;
    f2[fi] = formants.f2;
    f3[fi] = formants.f3;

    const pitchOk = bestC > 0.08;
    const hiss = sibilance[fi] > 0.32 || zcr[fi] > 0.18;
    reject[fi] = hiss ? 1 : 0;
    voiced[fi] = pitchOk && !hiss ? 1 : 0;

    if (onProgress && (fi & 255) === 0) onProgress(fi / Math.max(1, nFrames));
  }
  if (onProgress) onProgress(1);

  const energies = Array.from(energy).filter((v) => v > 0).sort((a, b) => a - b);
  const p95 = energies.length ? energies[Math.floor(energies.length * 0.95)] : 1e-6;
  const p50 = energies.length ? energies[Math.floor(energies.length * 0.5)] : 1e-6;
  const speech = Math.max(p50 * 4, p95 * 0.15, 1e-8);
  const silenceThr = speech * 0.04;
  const hissAbs = speech * 0.08;

  const kind = new Uint8Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    // Ratio can hide S under a loud vowel; absolute high-band energy cannot.
    if (highBand[i] > hissAbs) reject[i] = 1;
    if (energy[i] < silenceThr) kind[i] = 0;
    else if (reject[i]) kind[i] = 1;
    else if (voiced[i]) kind[i] = 2;
    else kind[i] = 1;
  }
  fillTinySilenceHoles(kind, reject, 1);

  return {
    sampleRate: ANALYSIS_RATE,
    hop: HOP,
    hopSec: HOP / ANALYSIS_RATE,
    fftSize: FFT_SIZE,
    nFrames,
    duration: nFrames * (HOP / ANALYSIS_RATE) + FFT_SIZE / ANALYSIS_RATE,
    energy,
    flatness,
    voiced,
    f0,
    f1,
    f2,
    f3,
    centroid,
    hnr,
    kind,
    sibilance,
    highBand,
    zcr,
    reject,
    silenceThr,
    speech,
    samples: x,
  };
}

export function spectrogram(samples, sampleRate, cols, rows, fMax = 8000) {
  const n = 512;
  const fft = createFft(n);
  const window = hamming(n);
  const hop = Math.max(1, Math.floor((samples.length - n) / Math.max(1, cols - 1)));
  const binHz = sampleRate / n;
  const maxBin = Math.min(n / 2, Math.floor(fMax / binHz));
  const out = new Uint8Array(cols * rows);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const db = new Float32Array(cols * maxBin);

  let peak = -Infinity;
  for (let c = 0; c < cols; c++) {
    const off = Math.min(Math.max(0, samples.length - n), c * hop);
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n; i++) re[i] = (samples[off + i] || 0) * window[i];
    fft.forward(re, im);
    for (let k = 1; k < maxBin; k++) {
      const v = Math.log(re[k] * re[k] + im[k] * im[k] + 1e-12);
      db[c * maxBin + k] = v;
      if (v > peak) peak = v;
    }
  }

  const floor = peak - 9;
  const span = Math.max(1e-6, peak - floor);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const k = 1 + Math.floor((r / rows) * (maxBin - 1));
      const v = (db[c * maxBin + k] - floor) / span;
      out[c * rows + r] = Math.max(0, Math.min(255, (v * 255) | 0));
    }
  }
  return { data: out, cols, rows };
}
