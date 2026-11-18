export function hashInt(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

export function hashCoords(a: number, b: number, c: number, seed: number): number {
  let h = seed >>> 0;
  h = hashInt(h ^ Math.imul(a | 0, 374761393));
  h = hashInt(h ^ Math.imul(b | 0, 668265263));
  h = hashInt(h ^ Math.imul(c | 0, 2147483647));
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

// Fast deterministic 3D gradient noise in [-1, 1]
export function noise3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);

  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const h000 = hashCoords(xi, yi, zi, seed);
  const h100 = hashCoords(xi + 1, yi, zi, seed);
  const h010 = hashCoords(xi, yi + 1, zi, seed);
  const h110 = hashCoords(xi + 1, yi + 1, zi, seed);
  const h001 = hashCoords(xi, yi, zi + 1, seed);
  const h101 = hashCoords(xi + 1, yi, zi + 1, seed);
  const h011 = hashCoords(xi, yi + 1, zi + 1, seed);
  const h111 = hashCoords(xi + 1, yi + 1, zi + 1, seed);

  const x1 = lerp(grad3(h000, xf, yf, zf), grad3(h100, xf - 1, yf, zf), u);
  const x2 = lerp(grad3(h010, xf, yf - 1, zf), grad3(h110, xf - 1, yf - 1, zf), u);
  const y1 = lerp(x1, x2, v);

  const x3 = lerp(grad3(h001, xf, yf, zf - 1), grad3(h101, xf - 1, yf, zf - 1), u);
  const x4 = lerp(grad3(h011, xf, yf - 1, zf - 1), grad3(h111, xf - 1, yf - 1, zf - 1), u);
  const y2 = lerp(x3, x4, v);

  return lerp(y1, y2, w);
}

export function fbm3D(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves = 4,
  lacunarity = 2.05,
  gain = 0.5
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

export function ridgedFbm3D(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(noise3D(x * freq, y * freq, z * freq, seed + i * 1973));
    sum += amp * (n * n);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return norm > 0 ? sum / norm : 0;
}
