import { colorFor } from "./vowels.js";

function magma(t) {
  const x = Math.max(0, Math.min(1, t));
  const r = Math.min(1, 0.05 + 2.4 * x * x);
  const g = Math.max(0, -0.15 + 1.15 * x);
  const b = Math.min(1, 0.18 + 0.55 * x + (x > 0.65 ? (x - 0.65) * 2.2 : 0));
  return [r * 255, g * 255, b * 255];
}

export function drawWaveform(canvas, samples, runs, t0, t1, playhead) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#16120e";
  ctx.fillRect(0, 0, w, h);

  const dur = Math.max(1e-6, t1 - t0);
  const mid = h / 2;

  if (runs) {
    for (const run of runs) {
      const x0 = ((run.cutStart - t0) / dur) * w;
      const x1 = ((run.cutEnd - t0) / dur) * w;
      ctx.fillStyle = run.keep ? hexA(colorFor(run.ipa), 0.28) : "rgba(80,70,60,0.18)";
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }
  }

  ctx.strokeStyle = "#e8dcc4";
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(1, Math.floor(samples.length / w));
  for (let x = 0; x < w; x++) {
    const i = Math.min(samples.length - 1, x * step);
    let min = 1;
    let max = -1;
    for (let k = 0; k < step; k++) {
      const s = samples[i + k] || 0;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const y0 = mid - max * mid * 0.92;
    const y1 = mid - min * mid * 0.92;
    ctx.moveTo(x + 0.5, y0);
    ctx.lineTo(x + 0.5, y1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (playhead != null) {
    const x = ((playhead - t0) / dur) * w;
    ctx.strokeStyle = "#ff5a36";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

export function drawSpectrogram(canvas, spec, runs, t0, t1, playhead) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.createImageData(w, h);
  const { data, cols, rows } = spec;

  for (let x = 0; x < w; x++) {
    const c = Math.min(cols - 1, Math.floor((x / w) * cols));
    for (let y = 0; y < h; y++) {
      const r = Math.min(rows - 1, Math.floor((1 - y / h) * rows));
      const v = data[c * rows + r] / 255;
      const [R, G, B] = magma(v);
      const i = (y * w + x) * 4;
      img.data[i] = R;
      img.data[i + 1] = G;
      img.data[i + 2] = B;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const dur = Math.max(1e-6, t1 - t0);
  if (runs) {
    ctx.globalCompositeOperation = "screen";
    for (const run of runs) {
      const x0 = ((run.cutStart - t0) / dur) * w;
      const x1 = ((run.cutEnd - t0) / dur) * w;
      ctx.fillStyle = hexA(colorFor(run.ipa), run.keep ? 0.22 : 0.08);
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      if (run.keep && x1 - x0 > 18) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = colorFor(run.ipa);
        ctx.font = "600 11px IBM Plex Mono, ui-monospace, monospace";
        ctx.fillText(`/${run.ipa}/`, x0 + 4, 14);
        ctx.globalCompositeOperation = "screen";
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  if (playhead != null) {
    const x = ((playhead - t0) / dur) * w;
    ctx.strokeStyle = "#fff6e8";
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function sizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
