// Progress in localStorage: unlocked level, coins, stars per level and settings.

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
}

export interface Save {
  v: 1;
  /** Highest level index unlocked (0-based). */
  unlocked: number;
  coins: number;
  /** Best stars per level id. */
  stars: Record<string, number>;
  settings: Settings;
  /** Tips already shown (tutorial, new mechanics). */
  seen: string[];
}

const KEY = 'jelly-buster.save.v1';

export function fresh(): Save {
  return { v: 1, unlocked: 0, coins: 200, stars: {}, settings: { sound: true, music: true, haptics: true }, seen: [] };
}

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as Save;
    if (s.v !== 1) return fresh();
    return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } };
  } catch {
    return fresh();
  }
}

export function store(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: progress just won't persist */
  }
}
