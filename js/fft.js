/** Radix-2 iterative FFT. n must be a power of two. */

export function createFft(n) {
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error("FFT size must be a power of two");
  }

  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i;
    let y = 0;
    for (let b = 0; b < bits; b++) {
      y = (y << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = y;
  }

  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const a = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }

  function transform(real, imag, inverse) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = real[i];
        real[i] = real[j];
        real[j] = tr;
        const ti = imag[i];
        imag[i] = imag[j];
        imag[j] = ti;
      }
    }

    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        let k = 0;
        for (let j = 0; j < half; j++) {
          const reW = cos[k];
          const imW = inverse ? -sin[k] : sin[k];
          const evenRe = real[i + j];
          const evenIm = imag[i + j];
          const oddRe = real[i + j + half];
          const oddIm = imag[i + j + half];
          const tRe = reW * oddRe - imW * oddIm;
          const tIm = reW * oddIm + imW * oddRe;
          real[i + j] = evenRe + tRe;
          imag[i + j] = evenIm + tIm;
          real[i + j + half] = evenRe - tRe;
          imag[i + j + half] = evenIm - tIm;
          k += step;
        }
      }
    }

    if (inverse) {
      const invN = 1 / n;
      for (let i = 0; i < n; i++) {
        real[i] *= invN;
        imag[i] *= invN;
      }
    }
  }

  return {
    n,
    forward(real, imag) {
      transform(real, imag, false);
    },
    inverse(real, imag) {
      transform(real, imag, true);
    },
  };
}
