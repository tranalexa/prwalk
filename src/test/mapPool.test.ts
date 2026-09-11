import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapPool } from '../utils/mapPool';

describe('mapPool', () => {
  it('keeps results in input order', async () => {
    const results = await mapPool([3, 1, 2], 2, async (value) => value * 10);
    assert.deepEqual(results, [30, 10, 20]);
  });

  it('never runs more workers than the concurrency cap', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapPool(Array.from({ length: 20 }, (_, index) => index), 4, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value;
    });

    assert.equal(peak, 4);
  });

  it('stops scheduling after shouldStop returns true', async () => {
    const started: number[] = [];
    const results = await mapPool(
      [1, 2, 3, 4, 5, 6],
      2,
      async (value) => {
        started.push(value);
        return value;
      },
      { shouldStop: () => started.length >= 3 }
    );

    assert.ok(started.length >= 3);
    assert.ok(started.length < 6);
    assert.equal(results.filter((value) => value !== undefined).length, started.length);
  });
});
