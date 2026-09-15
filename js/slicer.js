import { classifyNucleus } from "./vowels.js";

const KIND_SILENCE = 0;
const KIND_NOISE = 1;
const KIND_VOWEL = 2;
const KIND_GRUNT = 3;

function kindName(k) {
  if (k === KIND_VOWEL) return "vowel";
  if (k === KIND_NOISE) return "noise";
  if (k === KIND_GRUNT) return "grunt";
  return "silence";
}

function frameAt(analysis, i) {
  return {
    t: i * analysis.hopSec,
    energy: analysis.energy[i],
    f1: analysis.f1[i],
    f2: analysis.f2[i],
    f3: analysis.f3[i],
    f0: analysis.f0[i],
    kind: analysis.kind[i],
  };
}

/** Contiguous runs, before erosion. */
export function findNuclei(analysis, { minDuration = 0.04 } = {}) {
  const { nFrames, hopSec, kind } = analysis;
  const runs = [];
  let i = 0;
  while (i < nFrames) {
    const k = kind[i];
    let j = i + 1;
    while (j < nFrames && kind[j] === k) j++;
    const start = i * hopSec;
    const end = j * hopSec;
    if (k === KIND_VOWEL && end - start >= minDuration) {
      const frames = [];
      for (let f = i; f < j; f++) frames.push(frameAt(analysis, f));
      const labeled = k === KIND_VOWEL ? classifyNucleus(frames) : {
        ipa: k === KIND_GRUNT ? "grunt" : "noise",
        confidence: 0.6,
        acoustic: k === KIND_GRUNT ? "grunt" : "noise",
      };
      runs.push({
        i0: i,
        i1: j,
        start,
        end,
        kind: kindName(k),
        ipa: labeled.ipa,
        acoustic: labeled.acoustic,
        confidence: labeled.confidence,
        f1: labeled.f1,
        f2: labeled.f2,
        f3: labeled.f3,
        keep: k === KIND_VOWEL,
      });
    }
    i = j;
  }
  return runs;
}

/**
 * Chamfer each run inward. Never eat more than 20% of a short nucleus.
 * Fade is applied later at sample level.
 */
export function erodeRuns(runs, erosionSec, { minRemain = 0.03 } = {}) {
  return runs.flatMap((run) => {
    const start = run.start + erosionSec;
    const end = run.end - erosionSec;
    if (end - start < minRemain) return [];
    return [{ ...run, cutStart: start, cutEnd: end }];
  });
}

export function applyKeep(runs, keptIpa) {
  return runs.map((run) => ({
    ...run,
    keep: run.keepManual != null ? run.keepManual : !!keptIpa[run.ipa],
  }));
}

export function extractSamples(source, sampleRate, cutStart, cutEnd, fadeSec) {
  const a = Math.max(0, Math.floor(cutStart * sampleRate));
  const b = Math.min(source.length, Math.ceil(cutEnd * sampleRate));
  if (b <= a) return new Float32Array(0);
  const out = source.slice(a, b);
  const fade = Math.min(Math.floor(fadeSec * sampleRate), Math.floor(out.length / 3));
  if (fade > 1) {
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      out[i] *= g;
      out[out.length - 1 - i] *= g;
    }
  }
  return out;
}

export function concatenate(source, sampleRate, runs, fadeSec) {
  const chunks = [];
  let total = 0;
  for (const run of runs) {
    if (!run.keep) continue;
    const c = extractSamples(source, sampleRate, run.cutStart, run.cutEnd, fadeSec);
    chunks.push(c);
    total += c.length;
  }
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function mapConcatTime(runs, t) {
  let acc = 0;
  for (const run of runs) {
    if (!run.keep) continue;
    const dur = run.cutEnd - run.cutStart;
    if (t < acc + dur) {
      return run.cutStart + (t - acc);
    }
    acc += dur;
  }
  return null;
}
