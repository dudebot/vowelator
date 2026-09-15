/**
 * Practical General American inventory for the slicer.
 * Acoustic prototypes are adult-male-ish F1/F2/F3 in Hz (Hillenbrand-ish).
 */

export const VOWELS = [
  { ipa: "i",  bucket: "EE/IH", name: "fleece",  example: "see",     f1: 342, f2: 2322, f3: 3000 },
  { ipa: "ɪ",  bucket: "EE/IH", name: "kit",     example: "sit",     f1: 427, f2: 2034, f3: 2684 },
  { ipa: "eɪ", bucket: "EY",    name: "face",    example: "day",     f1: 476, f2: 2089, f3: 2691, diphthong: true },
  { ipa: "ɛ",  bucket: "EH",    name: "dress",   example: "meh",     f1: 580, f2: 1799, f3: 2605 },
  { ipa: "æ",  bucket: "AE",    name: "trap",    example: "cat",     f1: 660, f2: 1720, f3: 2410 },
  { ipa: "ə",  bucket: "UH",    name: "comma",   example: "the",     f1: 500, f2: 1500, f3: 2500 },
  { ipa: "ʌ",  bucket: "UH",    name: "strut",   example: "huh",     f1: 623, f2: 1200, f3: 2550 },
  { ipa: "ɝ",  bucket: "URR",   name: "nurse",   example: "murder",  f1: 474, f2: 1379, f3: 1710, rhotic: true },
  { ipa: "ɚ",  bucket: "URR",   name: "letter",  example: "butter",  f1: 490, f2: 1350, f3: 1750, rhotic: true },
  { ipa: "ɑ",  bucket: "AW/AH", name: "father",  example: "ah",      f1: 768, f2: 1333, f3: 2522 },
  { ipa: "ɔ",  bucket: "AW/AH", name: "thought", example: "awe",     f1: 652, f2: 997,  f3: 2538 },
  { ipa: "oʊ", bucket: "OH",    name: "goat",    example: "go",      f1: 497, f2: 910,  f3: 2459, diphthong: true },
  { ipa: "ʊ",  bucket: "OO",    name: "foot",    example: "book",    f1: 469, f2: 1122, f3: 2434 },
  { ipa: "u",  bucket: "OO",    name: "goose",   example: "boob",    f1: 378, f2: 997,  f3: 2343 },
  { ipa: "aɪ", bucket: "EYE",   name: "price",   example: "I",       f1: 750, f2: 1100, f3: 2400, diphthong: true },
  { ipa: "aʊ", bucket: "OW",    name: "mouth",   example: "ow",      f1: 740, f2: 1200, f3: 2400, diphthong: true },
  { ipa: "ɔɪ", bucket: "OY",    name: "choice",  example: "boy",     f1: 590, f2: 900,  f3: 2400, diphthong: true },
];

export const NON_VOWELS = [
  { ipa: "breath", bucket: "BREATH", keepDefault: false },
  { ipa: "noise",  bucket: "NOISE",  keepDefault: false },
  { ipa: "grunt",  bucket: "GRUNT",  keepDefault: false },
];

export const IPA_INDEX = Object.fromEntries(VOWELS.map((v, i) => [v.ipa, i]));

export const COLORS = {
  i:  "#7ee0ff",
  ɪ:  "#5cc8e8",
  eɪ: "#8cffb3",
  ɛ:  "#c6ff6a",
  æ:  "#ffe066",
  ə:  "#d9c7a3",
  ʌ:  "#e0b07a",
  ɝ:  "#ff7a45",
  ɚ:  "#ff9a6b",
  ɑ:  "#ff5d73",
  ɔ:  "#e85d9c",
  oʊ: "#c77dff",
  ʊ:  "#9b8cff",
  u:  "#6b7bff",
  aɪ: "#ff3b3b",
  aʊ: "#ff8a3d",
  ɔɪ: "#ff4fd8",
  breath: "#6a6358",
  noise:  "#4a453e",
  grunt:  "#8a5a3a",
};

export function colorFor(ipa) {
  return COLORS[ipa] || "#c8bca8";
}

function dist2(f1, f2, f3, proto) {
  const d1 = (f1 - proto.f1) / 130;
  const d2 = (f2 - proto.f2) / 220;
  let d = d1 * d1 + d2 * d2;
  if (f3 > 400) {
    const d3 = proto.rhotic ? (f3 - proto.f3) / 180 : (f3 - proto.f3) / 400;
    d += d3 * d3;
  } else if (proto.rhotic) {
    d += 0.12;
  }
  return d;
}

/** Nearest monophthong. Diphthongs are assigned from trajectory, not static F1/F2. */
export function nearestMonophthong(f1, f2, f3) {
  let best = VOWELS[0];
  let bestD = Infinity;
  for (const v of VOWELS) {
    if (v.diphthong) continue;
    const d = dist2(f1, f2, f3, v);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  const conf = 1 / (1 + bestD);
  return { vowel: best, distance: bestD, confidence: conf };
}

export function classifyDiphthong(f1s, f2s, f1e, f2e) {
  const dF1 = f1e - f1s;
  const dF2 = f2e - f2s;
  const travel = Math.hypot(dF1 / 130, dF2 / 220);

  if (f1s > 580 && dF1 < -70 && dF2 > 180) {
    return { ipa: "aɪ", confidence: Math.min(1, 0.55 + travel / 4) };
  }
  if (f1s > 560 && dF1 < -60 && dF2 < -160) {
    return { ipa: "aʊ", confidence: Math.min(1, 0.55 + travel / 4) };
  }
  if (f2s < 1250 && dF2 > 240 && f1s > 430) {
    return { ipa: "ɔɪ", confidence: Math.min(1, 0.5 + travel / 4) };
  }
  if (dF2 > 160 && f1s > 380 && f1s < 620 && f2s > 1550) {
    return { ipa: "eɪ", confidence: Math.min(1, 0.5 + travel / 5) };
  }
  if (dF1 < -40 && f2s < 1250 && f2e < 1150 && f1s > 430) {
    return { ipa: "oʊ", confidence: Math.min(1, 0.45 + travel / 5) };
  }
  return null;
}

export function classifyNucleus(frames) {
  if (!frames.length) {
    return { ipa: "ə", confidence: 0, acoustic: "ə" };
  }

  const voiced = frames.filter((f) => f.f1 > 0 && f.f2 > 0);
  const use = voiced.length ? voiced : frames;
  const n = use.length;
  const head = use.slice(0, Math.max(1, Math.floor(n * 0.3)));
  const tail = use.slice(Math.max(0, Math.ceil(n * 0.7)));
  const mid = use.slice(Math.floor(n * 0.3), Math.ceil(n * 0.7) || n);

  const mean = (arr, key) => arr.reduce((s, f) => s + f[key], 0) / arr.length;
  const f1 = mean(mid.length ? mid : use, "f1");
  const f2 = mean(mid.length ? mid : use, "f2");
  const f3 = mean(mid.length ? mid : use, "f3");
  const f1s = mean(head, "f1");
  const f2s = mean(head, "f2");
  const f1e = mean(tail, "f1");
  const f2e = mean(tail, "f2");

  const diph = n >= 6 ? classifyDiphthong(f1s, f2s, f1e, f2e) : null;
  const mono = nearestMonophthong(f1, f2, f3);

  const rhoticSpace = f1 > 400 && f1 < 600 && f2 > 1200 && f2 < 1600;
  const rhoticF3 = f3 > 400 && f3 < 2050;
  if (rhoticF3 || (rhoticSpace && (mono.vowel.rhotic || mono.vowel.ipa === "ə" || mono.vowel.ipa === "ʌ"))) {
    const duration = frames[frames.length - 1].t - frames[0].t + 0.01;
    const energy = mean(use, "energy");
    const ipa = duration < 0.12 && energy < 0.04 ? "ɚ" : "ɝ";
    return { ipa, confidence: Math.max(mono.confidence, 0.6), acoustic: ipa, f1, f2, f3 };
  }

  if (diph && diph.confidence >= 0.55) {
    return { ipa: diph.ipa, confidence: diph.confidence, acoustic: mono.vowel.ipa, f1, f2, f3 };
  }

  return {
    ipa: mono.vowel.ipa,
    confidence: mono.confidence,
    acoustic: mono.vowel.ipa,
    f1,
    f2,
    f3,
  };
}
