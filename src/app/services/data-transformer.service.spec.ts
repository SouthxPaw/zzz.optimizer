import { TestBed } from '@angular/core/testing';
import { DataTransformerService } from './data-transformer.service';
import { DataMappingService } from './data-mapping.service';

/**
 * Baseline specs for raw-JSON -> model transformation.
 *
 * This is the code path that moving parse/transform work into a web worker
 * would relocate. The transform must stay a pure function of its input: no DOM,
 * no Angular DI beyond the mapping service, identical output for identical
 * input. These specs pin that contract.
 *
 * The fixture mirrors the real shape of assets/data/agents.json (array form,
 * numeric ids, nested element/specialty objects, lvl60_stats in game-API
 * spelling).
 */

function rawAgent(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 1061,
    name: 'Corin',
    rarity: 'A',
    element: { id: 200, name: 'Physical' },
    specialty: { id: 1, name: 'Attack' },
    attack_type: { id: 101, name: 'Slash' },
    scoring: { buffs: [], debuffs: [], dazeBonus: 0 },
    lvl60_stats: {
      HpMax: 6976,
      Defence: 604,
      Attack: 807,
      Crit: 500,
      CritDamage: 7880,
      PenRate: 0,
      BreakStun: 93,
      ElementAbnormalPower: 96,
      ElementMystery: 96,
      SpBarPoint: 12,
    },
    ...overrides,
  };
}

describe('DataTransformerService', () => {
  let service: DataTransformerService;

  beforeEach(() => {
    spyOn(console, 'error');
    spyOn(console, 'warn');

    TestBed.configureTestingModule({
      providers: [DataTransformerService, DataMappingService],
    });
    service = TestBed.inject(DataTransformerService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('transformAgents', () => {
    it('transforms an array of raw agents', () => {
      const agents = service.transformAgents([rawAgent()]);
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe('Corin');
    });

    it('returns an empty array for an empty input array', () => {
      expect(service.transformAgents([])).toEqual([]);
    });

    it('stringifies the numeric id', () => {
      const agents = service.transformAgents([rawAgent({ id: 1061 })]);
      expect(agents[0].id).toBe('1061');
    });

    it('carries the rarity through', () => {
      const agents = service.transformAgents([rawAgent({ rarity: 'S' })]);
      expect(agents[0].rarity).toBe('S');
    });

    it('populates level 60 stats', () => {
      const agents = service.transformAgents([rawAgent()]);
      expect(agents[0].lvl60Stats).toBeTruthy();
      expect(agents[0].lvl60Stats.atk).toBeGreaterThan(0);
      expect(agents[0].lvl60Stats.hp).toBeGreaterThan(0);
    });

    it('skips an entry missing required fields without discarding valid ones', () => {
      // Missing name/element/specialty -> transformSingleAgent returns null and
      // the entry is skipped.
      const agents = service.transformAgents([
        rawAgent(),
        { id: 9998 },
        rawAgent({ id: 1062, name: 'Other' }),
      ]);
      expect(agents.length).toBe(2);
    });

    /**
     * BASELINE (latent bug - see notes): a null array entry aborts the whole
     * transform instead of being skipped.
     *
     * transformAgents wraps each entry in try/catch, but the catch block logs
     * `rawAgent.id` - which throws again on a null entry, from inside the
     * handler, so the error escapes the loop. One bad record therefore discards
     * every remaining agent rather than just itself.
     *
     * Pinned as-is per the decision to lock in current behaviour. Fixing it is
     * a one-line change (log the loop index, or guard the entry before use),
     * but it changes import behaviour and should be a deliberate edit.
     */
    it('BASELINE: a null array entry aborts the whole transform', () => {
      expect(() =>
        service.transformAgents([rawAgent(), null, rawAgent({ id: 1062, name: 'Other' })])
      ).toThrow();
    });

    it('transforms several agents independently', () => {
      const agents = service.transformAgents([
        rawAgent({ id: 1, name: 'A' }),
        rawAgent({ id: 2, name: 'B' }),
        rawAgent({ id: 3, name: 'C' }),
      ]);
      expect(agents.map(a => a.name)).toEqual(['A', 'B', 'C']);
    });

    it('is a pure function of its input (repeat calls agree)', () => {
      const input = [rawAgent()];
      const first = service.transformAgents(input);
      const second = service.transformAgents(input);
      expect(second).toEqual(first);
    });

    it('does not mutate the raw input', () => {
      const input = [rawAgent()];
      const snapshot = JSON.stringify(input);
      service.transformAgents(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('produces no NaN stat values', () => {
      const agents = service.transformAgents([rawAgent()]);
      Object.entries(agents[0].lvl60Stats as Record<string, any>).forEach(([key, value]) => {
        if (typeof value === 'number') {
          expect(Number.isNaN(value)).withContext(`${key} is NaN`).toBe(false);
        }
      });
    });
  });

  describe('transformSingleAgent', () => {
    it('transforms a valid agent', () => {
      const agent = service.transformSingleAgent('1061', rawAgent());
      expect(agent).toBeTruthy();
      expect(agent!.name).toBe('Corin');
    });

    it('returns null when required fields are missing', () => {
      expect(service.transformSingleAgent('1', { id: 1 })).toBeNull();
    });

    /**
     * BASELINE: null input throws rather than returning null - the method reads
     * rawAgent.name before any guard. Callers rely on the try/catch in
     * transformAgents to absorb this. Documented, not endorsed.
     */
    it('BASELINE: throws on null input rather than returning null', () => {
      expect(() => service.transformSingleAgent('1', null)).toThrow();
    });

    it('uses the id argument it is given', () => {
      const agent = service.transformSingleAgent('9999', rawAgent());
      expect(agent!.id).toBe('9999');
    });

    it('survives missing lvl60_stats', () => {
      const raw = rawAgent();
      delete raw['lvl60_stats'];
      expect(() => service.transformSingleAgent('1061', raw)).not.toThrow();
    });

    it('survives a missing element block', () => {
      const raw = rawAgent();
      delete raw['element'];
      expect(() => service.transformSingleAgent('1061', raw)).not.toThrow();
    });

    it('survives a missing specialty block', () => {
      const raw = rawAgent();
      delete raw['specialty'];
      expect(() => service.transformSingleAgent('1061', raw)).not.toThrow();
    });
  });

  describe('transformWEngines', () => {
    it('does not throw on an empty object', () => {
      expect(() => service.transformWEngines({})).not.toThrow();
    });

    it('returns an array', () => {
      expect(Array.isArray(service.transformWEngines({}))).toBe(true);
    });

    /** BASELINE: Object.entries(null) throws; there is no null guard. */
    it('BASELINE: throws on null input', () => {
      expect(() => service.transformWEngines(null)).toThrow();
    });
  });

  describe('transformDiscSets', () => {
    it('does not throw on an empty object', () => {
      expect(() => service.transformDiscSets({})).not.toThrow();
    });

    it('returns an array', () => {
      expect(Array.isArray(service.transformDiscSets({}))).toBe(true);
    });

    /** BASELINE: Object.entries(null) throws; there is no null guard. */
    it('BASELINE: throws on null input', () => {
      expect(() => service.transformDiscSets(null)).toThrow();
    });
  });

  describe('worker-compatibility contract', () => {
    /**
     * If the transform is moved into a web worker it must not touch the DOM or
     * any window-only API. These specs assert the output is structurally
     * cloneable (the constraint for postMessage) and free of functions.
     */
    it('produces structurally cloneable output', () => {
      const agents = service.transformAgents([rawAgent()]);
      expect(() => structuredClone(agents)).not.toThrow();
    });

    it('produces plain data with no function-valued properties', () => {
      const agents = service.transformAgents([rawAgent()]);
      const hasFunction = JSON.stringify(agents) === undefined;
      expect(hasFunction).toBe(false);
      Object.values(agents[0] as Record<string, any>).forEach(v => {
        expect(typeof v).not.toBe('function');
      });
    });
  });
});
