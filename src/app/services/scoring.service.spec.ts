import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScoringService } from './scoring.service';
import { Disc, MainStatType, SubStatType } from '../models/disc.model';
import { DiscSlot } from '../models/agent.model';

/**
 * These specs pin CURRENT scoring behaviour as the baseline. They are a
 * regression net for the performance work (memoisation, moving transform work
 * off the main thread); they are not a statement that every number here is
 * the ideal game-accurate value.
 *
 * The service loads its weight tables over HTTP in the constructor. Rather than
 * replay the real 359 kB weights file, these specs install small synthetic
 * weight profiles on the private fields so the maths is checkable by hand.
 */

type Weights = { [agentId: string]: any };

function disc(overrides: Partial<Disc> = {}): Disc {
  return {
    uid: 'disc-1',
    slot: 'Drive1' as DiscSlot,
    set: 'Woodpecker Electro',
    rarity: 'S',
    level: 15,
    mainStat: { type: 'ATK' as MainStatType, value: 316 },
    subStats: [],
    lock: false,
    ...overrides,
  };
}

function sub(type: SubStatType, value: number) {
  return { type, value };
}

/** A six-disc set, all defaults, so build-level calls have a full loadout. */
function sixDiscs(): Disc[] {
  return ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'].map((slot, i) =>
    disc({ uid: `disc-${i + 1}`, slot: slot as DiscSlot })
  );
}

describe('ScoringService', () => {
  let service: ScoringService;
  let httpMock: HttpTestingController;

  /** Install synthetic stat weights on the service's private state. */
  function setStatWeights(weights: Weights): void {
    (service as any).agentStatWeights = weights;
  }

  beforeEach(() => {
    // The service logs its own load failures; the deliberate 404s below would
    // otherwise bury real spec failures in console noise.
    spyOn(console, 'error');
    spyOn(console, 'warn');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ScoringService],
    });
    service = TestBed.inject(ScoringService);
    httpMock = TestBed.inject(HttpTestingController);

    // The constructor kicks off data loads; let them 404 harmlessly. Specs that
    // need weight data install it directly via setStatWeights().
    httpMock.match(() => true).forEach(req => req.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  afterEach(() => {
    httpMock.match(() => true).forEach(req => req.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('detectBuildType', () => {
    const twoBuilds: Weights = {
      agent1: { builds: { CRIT: {}, Anomaly: {} } },
    };

    it('defaults to CRIT with no agent id', () => {
      expect(service.detectBuildType(sixDiscs())).toBe('CRIT');
    });

    it('defaults to CRIT for an agent with no weight data', () => {
      setStatWeights({});
      expect(service.detectBuildType(sixDiscs(), 'unknown-agent')).toBe('CRIT');
    });

    it('returns the only available build type when just one exists', () => {
      setStatWeights({ agent1: { builds: { Anomaly: {} } } });
      expect(service.detectBuildType(sixDiscs(), 'agent1')).toBe('Anomaly');
    });

    it('detects Anomaly from an Anomaly_Mastery main stat', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      discs[5].mainStat = { type: 'Anomaly_Mastery' as MainStatType, value: 92 };
      expect(service.detectBuildType(discs, 'agent1')).toBe('Anomaly');
    });

    it('detects CRIT from a CRIT_DMG main stat', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      discs[3].mainStat = { type: 'CRIT_DMG' as MainStatType, value: 48 };
      expect(service.detectBuildType(discs, 'agent1')).toBe('CRIT');
    });

    it('detects Anomaly from Anomaly_Proficiency substat rolls', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      // 9 AP per roll -> 54 is 6 rolls, beating zero CRIT rolls.
      discs[0].subStats = [sub('Anomaly_Proficiency' as SubStatType, 54)];
      expect(service.detectBuildType(discs, 'agent1')).toBe('Anomaly');
    });

    it('detects CRIT from CRIT substat rolls', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      discs[0].subStats = [sub('CRIT_Rate' as SubStatType, 9.6)]; // 4 rolls
      discs[1].subStats = [sub('CRIT_DMG' as SubStatType, 19.2)]; // 4 rolls
      expect(service.detectBuildType(discs, 'agent1')).toBe('CRIT');
    });

    it('weights a main stat more heavily than a single substat roll', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      // Anomaly main stat (+10) vs 2 CRIT_Rate rolls (+2) -> Anomaly wins.
      discs[5].mainStat = { type: 'Anomaly_Mastery' as MainStatType, value: 92 };
      discs[0].subStats = [sub('CRIT_Rate' as SubStatType, 4.8)];
      expect(service.detectBuildType(discs, 'agent1')).toBe('Anomaly');
    });

    /**
     * BASELINE: ties resolve to CRIT because the comparison is a strict
     * `anomalyRolls > critRolls`. Documented here so a future change to the
     * tie-break is a deliberate, visible decision.
     */
    it('BASELINE: an exact tie resolves to CRIT', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      discs[3].mainStat = { type: 'CRIT_Rate' as MainStatType, value: 24 };   // +10 crit
      discs[5].mainStat = { type: 'Anomaly_Mastery' as MainStatType, value: 92 }; // +10 anomaly
      expect(service.detectBuildType(discs, 'agent1')).toBe('CRIT');
    });

    it('handles discs with no substats without throwing', () => {
      setStatWeights(twoBuilds);
      expect(() => service.detectBuildType(sixDiscs(), 'agent1')).not.toThrow();
    });

    it('handles an empty disc array', () => {
      setStatWeights(twoBuilds);
      expect(service.detectBuildType([], 'agent1')).toBe('CRIT');
    });
  });

  describe('resolveBuildType', () => {
    const twoBuilds: Weights = {
      agent1: { builds: { CRIT: {}, Anomaly: {} } },
    };

    it('honours a valid pinned build type over detection', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      // Discs look like CRIT, but Anomaly is pinned.
      discs[3].mainStat = { type: 'CRIT_DMG' as MainStatType, value: 48 };
      expect(service.resolveBuildType(discs, 'agent1', 'Anomaly')).toBe('Anomaly');
    });

    it('falls back to detection when the pinned type does not exist', () => {
      setStatWeights(twoBuilds);
      const discs = sixDiscs();
      discs[3].mainStat = { type: 'CRIT_DMG' as MainStatType, value: 48 };
      expect(service.resolveBuildType(discs, 'agent1', 'NonexistentProfile')).toBe('CRIT');
    });

    it('falls back to detection when no type is pinned', () => {
      setStatWeights({ agent1: { builds: { Anomaly: {} } } });
      expect(service.resolveBuildType(sixDiscs(), 'agent1')).toBe('Anomaly');
    });

    it('ignores a pinned type when no agent id is supplied', () => {
      setStatWeights(twoBuilds);
      expect(service.resolveBuildType(sixDiscs(), undefined, 'Anomaly')).toBe('CRIT');
    });
  });

  describe('getAvailableBuildTypes', () => {
    it('returns an empty array with no agent id', () => {
      expect(service.getAvailableBuildTypes()).toEqual([]);
    });

    it('returns an empty array for an unknown agent', () => {
      setStatWeights({});
      expect(service.getAvailableBuildTypes('nope')).toEqual([]);
    });

    it('lists the defined build profiles', () => {
      setStatWeights({ agent1: { builds: { CRIT: {}, Anomaly: {} } } });
      expect(service.getAvailableBuildTypes('agent1').sort()).toEqual(['Anomaly', 'CRIT']);
    });
  });

  describe('getBuildStatWeights', () => {
    it('returns an empty object for an unknown agent', () => {
      setStatWeights({});
      expect(service.getBuildStatWeights('nope', 'CRIT')).toEqual({});
    });

    it('returns an empty object for an unknown build type', () => {
      setStatWeights({ agent1: { builds: { CRIT: {} } } });
      expect(service.getBuildStatWeights('agent1', 'Anomaly')).toEqual({});
    });

    it('aggregates the max weight for a stat across slots', () => {
      setStatWeights({
        agent1: {
          builds: {
            CRIT: {
              contextualWeights: {
                Drive4: { CRIT_Rate: { substatWeights: { CRIT_DMG: 0.5 } } },
                Drive5: { 'ATK%': { substatWeights: { CRIT_DMG: 0.9 } } },
              },
            },
          },
        },
      });
      const weights = service.getBuildStatWeights('agent1', 'CRIT');
      expect(weights['CRIT_DMG']).toBe(0.9);
    });

    it('ignores non-standard main stat configurations', () => {
      setStatWeights({
        agent1: {
          builds: {
            CRIT: {
              contextualWeights: {
                // Energy_Regen is not a standard Drive4 main stat, so its
                // weights should not contribute.
                Drive4: { Energy_Regen: { substatWeights: { CRIT_DMG: 1.0 } } },
              },
            },
          },
        },
      });
      expect(service.getBuildStatWeights('agent1', 'CRIT')['CRIT_DMG']).toBeUndefined();
    });

    it('tolerates missing contextualWeights', () => {
      setStatWeights({ agent1: { builds: { CRIT: {} } } });
      expect(() => service.getBuildStatWeights('agent1', 'CRIT')).not.toThrow();
    });
  });

  describe('calculateDiscScore', () => {
    it('returns a numeric score for a bare disc', () => {
      const result = service.calculateDiscScore(disc());
      expect(result).toBeTruthy();
      expect(typeof (result as any).score).toBe('number');
      expect(Number.isNaN((result as any).score)).toBe(false);
    });

    it('does not throw on a disc with no substats', () => {
      expect(() => service.calculateDiscScore(disc({ subStats: [] }))).not.toThrow();
    });

    it('is deterministic for identical input', () => {
      const d = disc({ subStats: [sub('CRIT_DMG' as SubStatType, 19.2)] });
      const a = service.calculateDiscScore(d);
      const b = service.calculateDiscScore(d);
      expect((a as any).score).toBe((b as any).score);
    });

    it('scores a CRIT-heavy disc at least as high as an empty one', () => {
      const empty = service.calculateDiscScore(disc({ subStats: [] }));
      const loaded = service.calculateDiscScore(
        disc({
          subStats: [
            sub('CRIT_Rate' as SubStatType, 9.6),
            sub('CRIT_DMG' as SubStatType, 19.2),
          ],
        })
      );
      expect((loaded as any).score).toBeGreaterThanOrEqual((empty as any).score);
    });

    it('never returns a negative score', () => {
      const result = service.calculateDiscScore(
        disc({ subStats: [sub('DEF%' as SubStatType, 4.8)] })
      );
      expect((result as any).score).toBeGreaterThanOrEqual(0);
    });

    it('handles all six slots without throwing', () => {
      sixDiscs().forEach(d => {
        expect(() => service.calculateDiscScore(d)).not.toThrow();
      });
    });

    it('handles B and A rarity discs', () => {
      (['B', 'A', 'S'] as const).forEach(rarity => {
        expect(() => service.calculateDiscScore(disc({ rarity }))).not.toThrow();
      });
    });

    it('handles level 0 discs', () => {
      expect(() => service.calculateDiscScore(disc({ level: 0 }))).not.toThrow();
    });
  });

  describe('breakpoints', () => {
    it('reports whether breakpoints are loaded', () => {
      expect(typeof service.areBreakpointsLoaded()).toBe('boolean');
    });

    it('returns undefined for an unknown agent', () => {
      expect(service.getAgentBreakpoints('does-not-exist')).toBeUndefined();
    });
  });

  describe('robustness against malformed input', () => {
    it('tolerates a disc whose substat type is unknown', () => {
      const d = disc({ subStats: [{ type: 'NotAStat' as SubStatType, value: 5 }] });
      expect(() => service.calculateDiscScore(d)).not.toThrow();
    });

    it('tolerates a zero-value substat', () => {
      const d = disc({ subStats: [sub('CRIT_Rate' as SubStatType, 0)] });
      expect(() => service.calculateDiscScore(d)).not.toThrow();
    });

    it('tolerates detectBuildType with malformed weight data', () => {
      setStatWeights({ agent1: null });
      expect(() => service.detectBuildType(sixDiscs(), 'agent1')).not.toThrow();
    });
  });
});
