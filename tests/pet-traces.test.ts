import { describe, expect, it } from 'vitest';

import { PETS } from '@/data/pets';
import { getPetTraces } from '@/data/petTraces';

describe('pet encyclopedia traces', () => {
  it('has a navigation trace for every pet in the encyclopedia', () => {
    for (const petId of Object.keys(PETS)) {
      const traces = getPetTraces(petId);
      expect(traces.length, petId).toBeGreaterThan(0);
      expect(traces[0]?.scene, petId).toBeTruthy();
    }
  });
});
