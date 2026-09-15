import { analyze, spectrogram } from "./dsp.js";

self.onmessage = (event) => {
  const { samples, sampleRate, specCols, specRows } = event.data;
  try {
    const result = analyze(samples, sampleRate, (p) => {
      self.postMessage({ type: "progress", p });
    });
    const spec = spectrogram(result.samples, result.sampleRate, specCols || 1400, specRows || 128);
    const analysis = {
      sampleRate: result.sampleRate,
      hop: result.hop,
      hopSec: result.hopSec,
      fftSize: result.fftSize,
      nFrames: result.nFrames,
      duration: result.duration,
      energy: result.energy,
      flatness: result.flatness,
      voiced: result.voiced,
      f0: result.f0,
      f1: result.f1,
      f2: result.f2,
      f3: result.f3,
      centroid: result.centroid,
      hnr: result.hnr,
      kind: result.kind,
      sibilance: result.sibilance,
      zcr: result.zcr,
      reject: result.reject,
      silenceThr: result.silenceThr,
      speech: result.speech,
    };
    const transfers = [
      result.energy,
      result.flatness,
      result.voiced,
      result.f0,
      result.f1,
      result.f2,
      result.f3,
      result.centroid,
      result.hnr,
      result.kind,
      result.sibilance,
      result.zcr,
      result.reject,
      result.samples,
      spec && spec.data,
    ]
      .map((a) => a && a.buffer)
      .filter(Boolean);
    self.postMessage(
      { type: "done", analysis, analysisSamples: result.samples, spec },
      transfers,
    );
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
