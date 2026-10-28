// Add another look by implementing a drawer and adding one entry here. The picker,
// saved preference, and all gameplay/preview jellies use this registry.
import type { JellyLook } from './jelly';
import { drawJunimo } from './skins/junimo';

export type SkinDrawer = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, n: number | string, look: JellyLook) => void;

export interface Skin {
  id: string;
  name: string;
  description: string;
  draw: SkinDrawer | null;
}

export const SKINS: readonly Skin[] = [
  { id: 'classic', name: 'Classic', description: 'The original squishy jellies', draw: null },
  { id: 'junimo', name: 'Junimo', description: 'Tiny pixel forest friends', draw: drawJunimo },
];

let active = 'classic';

export function setSkin(id: string): string {
  active = SKINS.some((skin) => skin.id === id) ? id : 'classic';
  return active;
}

export function skinDrawer(id?: string): SkinDrawer | null {
  return SKINS.find((skin) => skin.id === (id ?? active))?.draw ?? null;
}
