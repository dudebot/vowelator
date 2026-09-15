import { createFft } from "./fft.js";
import { analyze } from "./dsp.js";
import { makeDemoSamples } from "./synth.js";
import { findNuclei, erodeRuns, concatenate } from "./slicer.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const n = 32;
const fft = createFft(n);
const re = new Float32Array(n);
const im = new Float32Array(n);
for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 3 * i) / n);
const orig = Float32Array.from(re);
fft.forward(re, im);
fft.inverse(re, im);
let err = 0;
for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(re[i] - orig[i]));
assert(err < 1e-5, `FFT roundtrip error ${err}`);
console.log("fft ok", err);

const { samples, sampleRate } = makeDemoSamples();
const analysis = analyze(samples, sampleRate);
const runs = erodeRuns(findNuclei(analysis, { minDuration: 0.04 }), 0.02);
console.log(
  "nuclei",
  runs.map((r) => `${r.kind}/${r.ipa} ${r.start.toFixed(2)}-${r.end.toFixed(2)} c=${r.confidence.toFixed(2)} f1=${(r.f1 || 0).toFixed(0)} f2=${(r.f2 || 0).toFixed(0)}`),
);
const vowels = runs.filter((r) => r.kind === "vowel");
assert(vowels.length >= 4, `expected at least 4 vowels, got ${vowels.length}`);
const ipas = vowels.map((v) => v.ipa);
console.log("ipas", ipas.join(" "));
const expected = ["ɝ", "ɛ", "u", "ɔ", "aɪ"];
let hits = 0;
for (const e of expected) {
  if (ipas.includes(e)) hits++;
  else console.log("missing", e);
}
console.log(`hits ${hits}/${expected.length}`);
assert(hits >= 5, `too few target vowels classified (${hits})`);

const sLeak = vowels.some((v) => {
  const overlap = Math.min(v.end, 2.55) - Math.max(v.start, 2.16);
  return overlap > 0.05;
});
assert(!sLeak, "sibilant /s/ burst leaked into a vowel nucleus");

const kept = runs.map((r) => ({ ...r, keep: true }));
const out = concatenate(samples, sampleRate, kept, 0.006);
const ratio = out.length / samples.length;
console.log("kept ratio", ratio.toFixed(3), out.length, samples.length);
assert(ratio < 0.92, "vowel-only output should drop the consonant/breath gaps");
assert(out.length > sampleRate, "output should still contain the nuclei");
console.log("ok");
