import { analyze, spectrogram } from "./dsp.js";

self.onmessage = (event) => {
  const { samples, sampleRate, specCols, specRows } = event.data;
  try {
    const result = analyze(samples, sampleRate, (p) => {
      self.postMessage({ type: "progress", p });
    });
    const spec = spectrogram(result.samples, result.sampleRate, specCols || 1400, specRows || 128);
    self.postMessage(
      {
        type: "done",
        analysis: {
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
        },
        analysisSamples: result.samples,
        spec,
      },
      [
        result.energy.buffer,
        result.flatness.buffer,
        result.voiced.buffer,
        result.f0.buffer,
        result.f1.buffer,
        result.f2.buffer,
        result.f3.buffer,
        result.centroid.buffer,
        result.hnr.buffer,
        result.kind.buffer,
        result.sibilance.buffer,
        result.zcr.buffer,
        result.reject.buffer,
        result.samples.buffer,
        spec.data.buffer,
      ],
    );
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
