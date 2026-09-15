export function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);

  let o = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function samplesToAudioBuffer(ctx, samples, sampleRate) {
  const buf = ctx.createBuffer(1, Math.max(1, samples.length), sampleRate);
  buf.copyToChannel(samples, 0);
  return buf;
}

function stitchChunks(ctx, chunks, duration, sampleRate, channels) {
  const total = Math.max(1, Math.ceil(duration * sampleRate) + 64);
  const out = ctx.createBuffer(channels, total, sampleRate);
  for (const { buffer, timestamp } of chunks) {
    const offset = Math.max(0, Math.round(timestamp * sampleRate));
    for (let c = 0; c < channels; c++) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const dst = out.getChannelData(c);
      const n = Math.min(src.length, dst.length - offset);
      if (n > 0) dst.set(src.subarray(0, n), offset);
    }
  }
  return out;
}

async function decodeWithMediabunny(file, ctx) {
  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    AudioBufferSink,
  } = await import("https://cdn.jsdelivr.net/npm/mediabunny@1.56.2/+esm");

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("No audio track in this file.");
    if (!(await track.canDecode())) {
      throw new Error("This browser cannot decode that audio codec.");
    }
    const sampleRate = await track.getSampleRate();
    const channels = await track.getNumberOfChannels();
    const duration = await track.computeDuration();
    const sink = new AudioBufferSink(track);
    const chunks = [];
    for await (const wrapped of sink.buffers()) chunks.push(wrapped);
    if (!chunks.length) throw new Error("Audio track decoded empty.");
    return stitchChunks(ctx, chunks, duration, sampleRate, channels);
  } finally {
    input.dispose();
  }
}

export async function loadMediaFile(file, ctx) {
  const copy = await file.arrayBuffer();
  try {
    return await ctx.decodeAudioData(copy.slice(0));
  } catch {
    return decodeWithMediabunny(file, ctx);
  }
}

/** ffmpeg concat demuxer list. Sit it next to the original file. */
export function encodeFfconcat(runs, sourceName) {
  const file = (sourceName || "source").replace(/'/g, "'\\''");
  const lines = ["ffconcat version 1.0"];
  for (const run of runs) {
    if (!run.keep) continue;
    lines.push(`file '${file}'`);
    lines.push(`inpoint ${run.cutStart.toFixed(6)}`);
    lines.push(`outpoint ${run.cutEnd.toFixed(6)}`);
  }
  return `${lines.join("\n")}\n`;
}


