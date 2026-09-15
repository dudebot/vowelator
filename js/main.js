import { VOWELS, PRESETS, keptFromPreset, colorFor } from "./vowels.js";
import { downmix } from "./dsp.js";
import { findNuclei, erodeRuns, applyKeep, concatenate, extractSamples } from "./slicer.js";
import { loadMediaFile, samplesToAudioBuffer, exportWavAndTimeline } from "./audio-io.js";
import { makeDemoBuffer } from "./synth.js";
import { drawWaveform, drawSpectrogram, sizeCanvas } from "./draw.js";

const $ = (id) => document.getElementById(id);

const state = {
  ctx: null,
  name: "audio",
  sourceFile: null,
  source: null,
  sourceRate: 16000,
  analysis: null,
  analysisSamples: null,
  spec: null,
  runs: [],
  kept: keptFromPreset("grug"),
  preset: "grug",
  playing: null,
  playhead: null,
  playMode: null,
};

function audioCtx() {
  if (!state.ctx) state.ctx = new AudioContext();
  return state.ctx;
}

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function setProgress(p) {
  const el = $("progress");
  if (p == null) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.firstElementChild.style.width = `${Math.round(p * 100)}%`;
}

function erosionSec() {
  return Number($("erosion").value) / 1000;
}
function fadeSec() {
  return Number($("fade").value) / 1000;
}
function minDurSec() {
  return Number($("minDur").value) / 1000;
}

function rebuildRuns() {
  if (!state.analysis) return;
  if (state.playing) stopPlayback();
  const raw = findNuclei(state.analysis, { minDuration: minDurSec() });
  for (const run of raw) {
    const prev = state.runs.find((r) => Math.abs(r.start - run.start) < 0.02 && r.ipa === run.ipa);
    if (prev && prev.keepManual != null) run.keepManual = prev.keepManual;
  }
  state.runs = applyKeep(erodeRuns(raw, erosionSec()), state.kept);
  render();
}

function outputSamples() {
  if (!state.source) return new Float32Array(0);
  return concatenate(state.source, state.sourceRate, state.runs, fadeSec());
}

function applyPreset(id) {
  state.preset = id;
  state.kept = keptFromPreset(id);
  for (const run of state.runs) delete run.keepManual;
  rebuildRuns();
}

function renderPresets() {
  const root = $("presets");
  if (!root) return;
  root.innerHTML = "";
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `preset ${state.preset === p.id ? "on" : ""}`;
    b.textContent = p.name;
    b.title = p.hint;
    b.addEventListener("click", () => applyPreset(p.id));
    root.appendChild(b);
  }
}

function renderChips() {
  renderPresets();
  const root = $("chips");
  root.innerHTML = "";
  for (const v of VOWELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${state.kept[v.ipa] ? "on" : "off"}`;
    b.style.color = colorFor(v.ipa);
    b.textContent = `/${v.ipa}/`;
    b.title = `${v.name} — ${v.example}`;
    b.addEventListener("click", () => {
      state.kept[v.ipa] = !state.kept[v.ipa];
      state.preset = null;
      rebuildRuns();
    });
    root.appendChild(b);
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

function renderSegments() {
  const root = $("segments");
  root.innerHTML = "";
  for (const [idx, run] of state.runs.entries()) {
    const row = document.createElement("div");
    row.className = "seg";
    row.innerHTML = `
      <div class="ipa" style="color:${colorFor(run.ipa)}">/${run.ipa}/</div>
      <time>${fmtTime(run.cutStart)}–${fmtTime(run.cutEnd)}</time>
      <button type="button" data-play="${idx}">play</button>
      <button type="button" data-keep="${idx}">${run.keep ? "keep" : "drop"}</button>
    `;
    root.appendChild(row);
  }
  root.onclick = (e) => {
    const play = e.target.getAttribute?.("data-play");
    const keep = e.target.getAttribute?.("data-keep");
    if (play != null) playRun(state.runs[Number(play)]);
    if (keep != null) {
      const run = state.runs[Number(keep)];
      run.keepManual = !run.keep;
      rebuildRuns();
    }
  };
}

function paint() {
  if (!state.source) return;
  const wave = $("wave");
  const spec = $("spec");
  const out = $("outwave");
  sizeCanvas(wave);
  sizeCanvas(spec);
  sizeCanvas(out);
  const dur = state.source.length / state.sourceRate;
  const srcPlayhead = state.playMode === "src" ? state.playhead : state.playMode === "vowels" ? state.playhead : null;
  drawWaveform(wave, state.source, state.runs, 0, dur, state.playMode === "src" ? srcPlayhead : (state.playMode === "vowels" ? srcPlayhead : null));
  if (state.spec) {
    drawSpectrogram(spec, state.spec, state.runs, 0, dur, state.playMode ? srcPlayhead : null);
  }
  const cursed = outputSamples();
  const outDur = cursed.length / state.sourceRate;
  const outHead = state.playMode === "vowels" ? mapOutHead() : null;
  drawWaveform(out, cursed, null, 0, Math.max(outDur, 0.01), outHead);
}

function mapOutHead() {
  if (state.playMode !== "vowels" || state.playhead == null) return null;
  let acc = 0;
  for (const run of state.runs) {
    if (!run.keep) continue;
    const dur = run.cutEnd - run.cutStart;
    if (state.playhead >= run.cutStart && state.playhead <= run.cutEnd) {
      return acc + (state.playhead - run.cutStart);
    }
    acc += dur;
  }
  return acc;
}

function render() {
  $("workspace").classList.remove("hidden");
  $("drop").classList.add("hidden");
  const dur = state.source ? (state.source.length / state.sourceRate).toFixed(2) : "0";
  const vowels = state.runs.filter((r) => r.keep).length;
  $("meta").textContent = `${state.name} · ${dur}s · ${vowels} kept`;
  if (state.analysis) {
    setStatus(`${state.runs.length} nuclei · ${vowels} kept · trim ${$("erosion").value} ms`);
  }
  renderChips();
  renderSegments();
  paint();
}

function stopPlayback() {
  if (state.playing) {
    try { state.playing.stop(); } catch {}
  }
  state.playing = null;
  state.playhead = null;
  state.playMode = null;
  paint();
}

function playBuffer(buffer, mode, originMap) {
  stopPlayback();
  const ctx = audioCtx();
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  const t0 = ctx.currentTime;
  node.onended = () => {
    if (state.playing === node) stopPlayback();
  };
  node.start();
  state.playing = node;
  state.playMode = mode;
  const tick = () => {
    if (state.playing !== node) return;
    const t = ctx.currentTime - t0;
    state.playhead = originMap ? originMap(t) : t;
    paint();
    if (t < buffer.duration) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function playSource() {
  const ctx = audioCtx();
  const buf = samplesToAudioBuffer(ctx, state.source, state.sourceRate);
  playBuffer(buf, "src", (t) => t);
}

function playVowels() {
  const ctx = audioCtx();
  const samples = outputSamples();
  if (!samples.length) {
    setStatus("Nothing kept. Toggle some IPA chips on.");
    return;
  }
  const buf = samplesToAudioBuffer(ctx, samples, state.sourceRate);
  playBuffer(buf, "vowels", (t) => {
    let acc = 0;
    for (const run of state.runs) {
      if (!run.keep) continue;
      const dur = run.cutEnd - run.cutStart;
      if (t < acc + dur) return run.cutStart + (t - acc);
      acc += dur;
    }
    return state.source.length / state.sourceRate;
  });
}

function playRun(run) {
  if (!run) return;
  const ctx = audioCtx();
  const samples = extractSamples(state.source, state.sourceRate, run.cutStart, run.cutEnd, fadeSec());
  const buf = samplesToAudioBuffer(ctx, samples, state.sourceRate);
  playBuffer(buf, "src", (t) => run.cutStart + t);
}

async function analyzeBuffer(audioBuffer, name, sourceFile = null) {
  stopPlayback();
  state.name = name;
  state.sourceFile = sourceFile;
  state.source = downmix(audioBuffer);
  state.sourceRate = audioBuffer.sampleRate;
  setStatus("Scanning nuclei…");
  setProgress(0);
  $("workspace").classList.remove("hidden");

  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const samples = state.source.slice();
  const result = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === "progress") setProgress(e.data.p);
      if (e.data.type === "done") resolve(e.data);
      if (e.data.type === "error") reject(new Error(e.data.message));
    };
    worker.onerror = (e) => reject(e.error || new Error(e.message));
    worker.postMessage({ samples, sampleRate: state.sourceRate, specCols: 1400, specRows: 128 }, [samples.buffer]);
  });
  worker.terminate();

  state.analysis = result.analysis;
  state.analysisSamples = result.analysisSamples;
  state.spec = result.spec;
  state.runs = [];
  if (!state.preset) state.preset = "grug";
  state.kept = keptFromPreset(state.preset);
  setProgress(null);
  rebuildRuns();
}

async function loadFile(file) {
  setStatus(`Decoding ${file.name}…`);
  $("workspace").classList.remove("hidden");
  $("drop").classList.add("hidden");
  try {
    const ctx = audioCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const buf = await loadMediaFile(file, ctx);
    await analyzeBuffer(buf, file.name, file);
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err));
    setProgress(null);
  }
}

$("file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) loadFile(file);
});

$("demo").addEventListener("click", async () => {
  const ctx = audioCtx();
  if (ctx.state === "suspended") await ctx.resume();
  const buf = makeDemoBuffer(ctx);
  await analyzeBuffer(buf, "demo-vowels.wav");
});

const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const file = e.dataTransfer.files?.[0];
  if (file) loadFile(file);
});

for (const id of ["erosion", "fade", "minDur"]) {
  $(id).addEventListener("input", () => {
    $("erosionOut").textContent = `${$("erosion").value} ms`;
    $("fadeOut").textContent = `${$("fade").value} ms`;
    $("minOut").textContent = `${$("minDur").value} ms`;
    rebuildRuns();
  });
}

$("playSrc").addEventListener("click", playSource);
$("playVowels").addEventListener("click", playVowels);
$("stop").addEventListener("click", stopPlayback);
$("export").addEventListener("click", () => {
  const samples = outputSamples();
  if (!samples.length) {
    setStatus("Nothing to export.");
    return;
  }
  exportWavAndTimeline({
    samples,
    sampleRate: state.sourceRate,
    runs: state.runs,
    name: state.name,
  });
  setStatus("Saved .wav and .ffconcat — put the concat file next to the original for ffmpeg.");
});

window.addEventListener("resize", () => paint());
renderChips();
if (location.protocol === "file:") {
  setStatus("Needs http:// — from this folder run python -m http.server, or use GitHub Pages.");
}
