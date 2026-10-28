// The conveyor loop around the picture, as a list of discrete stations.
//
// A jelly enters at the bottom-left corner and travels clockwise-on-screen:
// bottom side left→right (looking up), right side bottom→top (looking left),
// top side right→left (looking down), left side top→bottom (looking right),
// then back to the launcher. Corner stations never fire.

export const CORNER = 2;

/** Side 0 bottom, 1 right, 2 top, 3 left; -1 for a corner. */
export interface Station {
  side: -1 | 0 | 1 | 2 | 3;
  /** Column (bottom/top) or row (left/right) the station looks along. */
  k: number;
}

export const trackLength = (w: number, h: number) => 2 * w + 2 * h + 4 * CORNER;

export function station(w: number, h: number, s: number): Station {
  let i = s;
  if (i < CORNER) return { side: -1, k: 0 };
  i -= CORNER;
  if (i < w) return { side: 0, k: i };
  i -= w;
  if (i < CORNER) return { side: -1, k: 1 };
  i -= CORNER;
  if (i < h) return { side: 1, k: h - 1 - i };
  i -= h;
  if (i < CORNER) return { side: -1, k: 2 };
  i -= CORNER;
  if (i < w) return { side: 2, k: w - 1 - i };
  i -= w;
  if (i < CORNER) return { side: -1, k: 3 };
  i -= CORNER;
  return { side: 3, k: i };
}

/** Index of the first filled cell seen from a station, or -1. */
export function firstInLine(cells: ArrayLike<number>, w: number, h: number, st: Station): number {
  const { side, k } = st;
  if (side === 0) {
    for (let y = h - 1; y >= 0; y--) if (cells[y * w + k] >= 0) return y * w + k;
  } else if (side === 1) {
    for (let x = w - 1; x >= 0; x--) if (cells[k * w + x] >= 0) return k * w + x;
  } else if (side === 2) {
    for (let y = 0; y < h; y++) if (cells[y * w + k] >= 0) return y * w + k;
  } else if (side === 3) {
    for (let x = 0; x < w; x++) if (cells[k * w + x] >= 0) return k * w + x;
  }
  return -1;
}

/** Cells currently reachable from at least one side, as a set of indices. */
export function exposed(cells: ArrayLike<number>, w: number, h: number): Set<number> {
  const out = new Set<number>();
  const L = trackLength(w, h);
  for (let s = 0; s < L; s++) {
    const st = station(w, h, s);
    if (st.side < 0) continue;
    const i = firstInLine(cells, w, h, st);
    if (i >= 0) out.add(i);
  }
  return out;
}
