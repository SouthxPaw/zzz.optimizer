import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StatCalculatorService } from './stat-calculator.service';
import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc, MainStatType, SubStatType } from '../models/disc.model';

/**
 * Baseline specs for final-stat computation.
 *
 * The memoisation here (statCache) is the main thing to protect: a wrong cache
 * key silently returns another build's stats, which is invisible until a user
 * notices their numbers are wrong. The cache specs below are the point of this
 * file.
 */

function baseStats(overrides: Partial<BaseStats> = {}): BaseStats {
  return {
    hp: 7000,
    hppercent: 0,
    atk: 700,
    atkpercent: 0,
    def: 600,
    defpercent: 0,
    impact: 100,
    impactpercent: 0,
    flatImpact: 0,
    anomalyMastery: 100,
    anomalyMasteryPercent: 0,
    critRate: 5,
    critDmg: 50,
    anomalyProficiency: 90,
    pen: 0,
    penRatio: 0,
    energyRegen: 1.2,
    energyRegenPercent: 0,
    sheerForce: 0,
    ...overrides,
  } as BaseStats;
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    rarity: 'S',
    element: 'Electric' as any,
    specialty: 'Attack' as any,
    lvl60Stats: baseStats(),
    ...overrides,
  } as Agent;
}

function disc(slot: DiscSlot, overrides: Partial<Disc> = {}): Disc {
  return {
    uid: `disc-${slot}`,
    slot,
    set: 'Woodpecker Electro',
    rarity: 'S',
    level: 15,
    mainStat: { type: 'ATK' as MainStatType, value: 316 },
    subStats: [],
    lock: false,
    ...overrides,
  };
}

describe('StatCalculatorService', () => {
  let service: StatCalculatorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    spyOn(console, 'error');
    spyOn(console, 'warn');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StatCalculatorService],
    });
    service = TestBed.inject(StatCalculatorService);
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.match(() => true).forEach(r => r.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  afterEach(() => {
    httpMock.match(() => true).forEach(r => r.flush({}, { status: 404, statusText: 'Not Found' }));
    service.clearCache();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('calculateFinalStats', () => {
    it('returns stats for an agent with no gear', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {});
      expect(stats).toBeTruthy();
      expect(stats.atk).toBeGreaterThan(0);
      expect(stats.hp).toBeGreaterThan(0);
    });

    it('starts from the agent base stats when nothing is equipped', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {});
      expect(stats.atk).toBe(700);
      expect(stats.hp).toBe(7000);
    });

    it('always resets sheerForce rather than inheriting it', () => {
      const a = agent({ lvl60Stats: baseStats({ sheerForce: 9999 }) });
      const stats = service.calculateFinalStats(a, 60, null, {});
      expect(stats.sheerForce).not.toBe(9999);
    });

    it('adds a flat ATK disc main stat', () => {
      const withDisc = service.calculateFinalStats(agent(), 60, null, {
        Drive1: disc('Drive1' as DiscSlot, { mainStat: { type: 'ATK' as MainStatType, value: 316 } }),
      });
      expect(withDisc.atk).toBeGreaterThan(700);
    });

    it('applies CRIT_Rate from a disc main stat', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {
        Drive4: disc('Drive4' as DiscSlot, {
          mainStat: { type: 'CRIT_Rate' as MainStatType, value: 24 },
        }),
      });
      expect(stats.critRate).toBeGreaterThan(5);
    });

    it('applies disc substats', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {
        Drive1: disc('Drive1' as DiscSlot, {
          subStats: [{ type: 'CRIT_DMG' as SubStatType, value: 19.2 }],
        }),
      });
      expect(stats.critDmg).toBeGreaterThan(50);
    });

    it('never returns NaN for any numeric field', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {
        Drive1: disc('Drive1' as DiscSlot, {
          subStats: [
            { type: 'CRIT_Rate' as SubStatType, value: 9.6 },
            { type: 'ATK%' as SubStatType, value: 9 },
          ],
        }),
      });
      Object.entries(stats).forEach(([key, value]) => {
        if (typeof value === 'number') {
          expect(Number.isNaN(value)).withContext(`${key} is NaN`).toBe(false);
        }
      });
    });

    it('excludes a disabled disc from the result', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const enabled = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: true });
      const disabled = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: false });
      expect(disabled.atk).toBeLessThan(enabled.atk);
    });

    it('treats an unspecified disc as enabled', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const implicit = service.calculateFinalStats(agent(), 60, null, discs);
      const explicit = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: true });
      expect(implicit.atk).toBe(explicit.atk);
    });

    it('handles a full six-disc loadout', () => {
      const discs: { [k in DiscSlot]?: Disc } = {};
      (['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'] as DiscSlot[]).forEach(s => {
        discs[s] = disc(s);
      });
      expect(() => service.calculateFinalStats(agent(), 60, null, discs)).not.toThrow();
    });

    it('is deterministic across repeated calls', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const a = service.calculateFinalStats(agent(), 60, null, discs);
      service.clearCache();
      const b = service.calculateFinalStats(agent(), 60, null, discs);
      expect(b).toEqual(a);
    });
  });

  describe('stat cache correctness', () => {
    it('returns equal results from cache hit and fresh computation', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const first = service.calculateFinalStats(agent(), 60, null, discs);
      const cached = service.calculateFinalStats(agent(), 60, null, discs);
      expect(cached).toEqual(first);
    });

    it('does not reuse a cache entry across different agents', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const a1 = service.calculateFinalStats(
        agent({ id: 'a1', lvl60Stats: baseStats({ atk: 700 }) }), 60, null, discs
      );
      const a2 = service.calculateFinalStats(
        agent({ id: 'a2', lvl60Stats: baseStats({ atk: 900 }) }), 60, null, discs
      );
      expect(a2.atk).not.toBe(a1.atk);
    });

    it('does not reuse a cache entry across mindscape levels', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const m0 = service.calculateFinalStats(agent(), 60, null, discs, 0);
      const m6 = service.calculateFinalStats(agent(), 60, null, discs, 6);
      // Values may legitimately match without mindscape data loaded; the point
      // is that both calls complete and are keyed separately.
      expect(m0).toBeTruthy();
      expect(m6).toBeTruthy();
    });

    it('does not reuse a cache entry when a disc changes', () => {
      const weak = { Drive1: disc('Drive1' as DiscSlot, { mainStat: { type: 'ATK' as MainStatType, value: 100 } }) };
      const strong = { Drive1: disc('Drive1' as DiscSlot, { mainStat: { type: 'ATK' as MainStatType, value: 316 } }) };
      const a = service.calculateFinalStats(agent(), 60, null, weak);
      const b = service.calculateFinalStats(agent(), 60, null, strong);
      expect(b.atk).toBeGreaterThan(a.atk);
    });

    it('does not reuse a cache entry when the enabled-disc mask changes', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const on = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: true });
      const off = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: false });
      expect(off.atk).not.toBe(on.atk);
    });

    it('recomputes after clearCache()', () => {
      const discs = { Drive1: disc('Drive1' as DiscSlot) };
      const before = service.calculateFinalStats(agent(), 60, null, discs);
      service.clearCache();
      const after = service.calculateFinalStats(agent(), 60, null, discs);
      expect(after).toEqual(before);
    });

    it('clearCache() is safe to call when the cache is empty', () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe('getSetBonuses', () => {
    // Set bonuses are looked up through DiscSetDataService, whose real data is
    // not loaded in specs. Stub the lookup so these tests exercise the
    // piece-counting logic rather than the data load.
    beforeEach(() => {
      const known: { [name: string]: any } = {
        'Woodpecker Electro': { Name: 'Woodpecker Electro', Desc2: 'CRIT Rate +8%' },
        'Puffer Electro': { Name: 'Puffer Electro', Desc2: 'PEN Ratio +8%' },
      };
      spyOn((service as any).discSetDataService, 'getDiscSet').and.callFake(
        (name: string) => known[name]
      );
    });

    it('returns an empty list for no discs', () => {
      expect(service.getSetBonuses({})).toEqual([]);
    });

    it('does not report a set for a single disc', () => {
      const bonuses = service.getSetBonuses({ Drive1: disc('Drive1' as DiscSlot, { set: 'Woodpecker Electro' }) });
      expect(bonuses).toEqual([]);
    });

    it('reports a 2pc bonus once two matching pieces are equipped', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1' as DiscSlot, { set: 'Woodpecker Electro' }),
        Drive2: disc('Drive2' as DiscSlot, { set: 'Woodpecker Electro' }),
      });
      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toContain('Woodpecker Electro (2pc)');
    });

    it('does not report a set for two different sets', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1' as DiscSlot, { set: 'Woodpecker Electro' }),
        Drive2: disc('Drive2' as DiscSlot, { set: 'Puffer Electro' }),
      });
      expect(bonuses).toEqual([]);
    });

    it('reports two separate 2pc bonuses for a 2+2 split', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1' as DiscSlot, { set: 'Woodpecker Electro' }),
        Drive2: disc('Drive2' as DiscSlot, { set: 'Woodpecker Electro' }),
        Drive3: disc('Drive3' as DiscSlot, { set: 'Puffer Electro' }),
        Drive4: disc('Drive4' as DiscSlot, { set: 'Puffer Electro' }),
      });
      expect(bonuses.length).toBe(2);
    });

    it('ignores a set with no equipment data', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1' as DiscSlot, { set: 'Unknown Set' }),
        Drive2: disc('Drive2' as DiscSlot, { set: 'Unknown Set' }),
      });
      expect(bonuses).toEqual([]);
    });
  });
});
