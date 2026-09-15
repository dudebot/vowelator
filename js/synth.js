/** Source-filter vowel demo so the app is usable without a file. */

function makeResonator(sr) {
  let a1 = 0;
  let a2 = 0;
  let y1 = 0;
  let y2 = 0;
  return {
    set(freq, bw) {
      const r = Math.exp((-Math.PI * bw) / sr);
      a1 = -2 * r * Math.cos((2 * Math.PI * freq) / sr);
      a2 = r * r;
    },
    step(x) {
      const y = x - a1 * y1 - a2 * y2;
      y2 = y1;
      y1 = y;
      return y;
    },
  };
}

function resonator(freq, bw, sr) {
  const r = makeResonator(sr);
  r.set(freq, bw);
  return (x) => r.step(x);
}

function noise() {
  return Math.random() * 2 - 1;
}

function pulse(t, f0) {
  const phase = (t * f0) % 1;
  return phase < 0.08 ? 1 - phase / 0.08 : 0;
}

function synthVowel(out, sr, start, end, f1, f2, f3, f0, gain) {
  const r1 = resonator(f1, 90, sr);
  const r2 = resonator(f2, 120, sr);
  const r3 = resonator(f3, 180, sr);
  const a = Math.floor(start * sr);
  const b = Math.min(out.length, Math.floor(end * sr));
  for (let i = a; i < b; i++) {
    const t = i / sr;
    const local = t - start;
    const env = Math.min(1, local / 0.02) * Math.min(1, (end - t) / 0.03);
    const src = pulse(t, f0) + noise() * 0.02;
    const y = r3(r2(r1(src)));
    out[i] += y * env * gain;
  }
}

function synthGlide(out, sr, start, end, a, b, f0, gain) {
  const steps = Math.floor((end - start) * sr);
  const off = Math.floor(start * sr);
  const r1 = makeResonator(sr);
  const r2 = makeResonator(sr);
  const r3 = makeResonator(sr);
  r1.set(a.f1, 90);
  r2.set(a.f2, 120);
  r3.set(a.f3, 180);
  for (let i = 0; i < steps && off + i < out.length; i++) {
    const u = i / Math.max(1, steps - 1);
    r1.set(a.f1 + (b.f1 - a.f1) * u, 90);
    r2.set(a.f2 + (b.f2 - a.f2) * u, 120);
    r3.set(a.f3 + (b.f3 - a.f3) * u, 180);
    const t = (off + i) / sr;
    const env = Math.min(1, (t - start) / 0.03) * Math.min(1, (end - t) / 0.04);
    const src = pulse(t, f0) + noise() * 0.02;
    const y = r3.step(r2.step(r1.step(src)));
    out[off + i] += y * env * gain;
  }
}

function synthNoise(out, sr, start, end, hp, gain) {
  let prev = 0;
  const a = Math.floor(start * sr);
  const b = Math.min(out.length, Math.floor(end * sr));
  const alpha = Math.exp((-2 * Math.PI * hp) / sr);
  for (let i = a; i < b; i++) {
    const t = i / sr;
    const env = Math.min(1, (t - start) / 0.01) * Math.min(1, (end - t) / 0.02);
    const n = noise();
    const hpN = n - prev + alpha * (out[i] || 0);
    prev = n;
    out[i] += hpN * env * gain;
  }
}

export function makeDemoSamples() {
  const sr = 16000;
  const duration = 6.2;
  const samples = new Float32Array(Math.floor(duration * sr));

  // consonants / breaths around the vowels from the spec
  synthNoise(samples, sr, 0.05, 0.16, 3500, 0.18);           // m-ish burst
  synthVowel(samples, sr, 0.16, 0.95, 474, 1379, 1710, 118, 0.12); // ɝ murder
  synthNoise(samples, sr, 0.95, 1.08, 1800, 0.12);           // d
  synthNoise(samples, sr, 1.35, 1.48, 4000, 0.1);
  synthVowel(samples, sr, 1.48, 2.15, 580, 1799, 2605, 130, 0.11); // ɛ meh
  synthNoise(samples, sr, 2.25, 2.55, 500, 0.08);            // breath
  synthNoise(samples, sr, 2.7, 2.82, 3000, 0.14);
  synthVowel(samples, sr, 2.82, 3.55, 378, 997, 2343, 125, 0.13);  // u boob
  synthNoise(samples, sr, 3.7, 3.82, 2200, 0.1);
  synthVowel(samples, sr, 3.82, 4.5, 652, 997, 2538, 110, 0.12);   // ɔ awe
  synthNoise(samples, sr, 4.62, 4.72, 4000, 0.16);
  synthGlide(                                                   // aɪ scream
    samples,
    sr,
    4.72,
    6.05,
    { f1: 750, f2: 1100, f3: 2400 },
    { f1: 330, f2: 2200, f3: 2700 },
    160,
    0.14,
  );

  let peak = 1e-9;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const g = 0.7 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= g;
  return { samples, sampleRate: sr };
}

export function makeDemoBuffer(ctx) {
  const { samples, sampleRate } = makeDemoSamples();
  const buf = ctx.createBuffer(1, samples.length, sampleRate);
  buf.copyToChannel(samples, 0);
  return buf;
}
