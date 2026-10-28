// Picture packs, played in order. Each pack is a themed group of recognizable pictures.
import { ADVENTURE } from './adventure';
import { CRITTERS } from './critters';
import { SNACKS } from './snacks';
import { STARTER } from './starter';
import type { Art } from './types';

export interface Pack {
  id: string;
  name: string;
  pictures: Art[];
}

export const PACKS: Pack[] = [
  { id: 'starter', name: 'Starter', pictures: STARTER },
  { id: 'critters', name: 'Critters', pictures: CRITTERS },
  { id: 'snacks', name: 'Snacks', pictures: SNACKS },
  { id: 'adventure', name: 'Adventure', pictures: ADVENTURE },
];

export type { Art };
