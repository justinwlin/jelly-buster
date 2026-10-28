import { describe, expect, it } from 'vitest';
import { fresh } from '../src/game/save';
import { SKINS, setSkin, skinDrawer } from '../src/game/skins';

describe('jelly looks', () => {
  it('offers each registered look once and defaults to Classic', () => {
    expect(new Set(SKINS.map((skin) => skin.id)).size).toBe(SKINS.length);
    expect(SKINS.map((skin) => skin.id)).toEqual(['classic', 'junimo']);
    expect(fresh().settings.skin).toBe('classic');
  });

  it('uses the chosen drawer, allows preview overrides, and rejects old unknown choices', () => {
    expect(setSkin('junimo')).toBe('junimo');
    expect(skinDrawer()).toBe(SKINS[1].draw);
    expect(skinDrawer('classic')).toBeNull();
    expect(setSkin('missing')).toBe('classic');
    expect(skinDrawer()).toBeNull();
  });
});
