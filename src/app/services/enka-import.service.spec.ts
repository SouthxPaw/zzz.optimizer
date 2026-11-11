import { TestBed } from '@angular/core/testing';
import { EnkaImportService } from './enka-import.service';
import { BuildService, AgentBuild } from './build.service';
import { DiscService } from './disc.service';
import { DbService } from './db.service';
import { EnkaBuildData } from './enka-api.service';

/**
 * Specs for merging an Enka import over an existing build.
 *
 * The mindscape rule is the important part: Enka only reports TalentLevel for
 * agents in the player's public showcase, so a 0 means "not reported" rather
 * than "M0". Writing that 0 straight through silently destroys a hand-set
 * mindscape, and the damage is quiet - stats just come out slightly low.
 */

function existingBuild(overrides: Partial<AgentBuild> = {}): AgentBuild {
  return {
    id: 'build-1',
    agentId: '1091',
    name: 'Miyabi',
    element: 'Ether',
    specialty: 'Attack',
    level: 60,
    mindscapeLevel: 0,
    wEngineRefinement: 1,
    equippedDiscs: {},
    calculatedStats: {} as any,
    score: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentBuild;
}

function incomingBuild(overrides: Partial<EnkaBuildData> = {}): EnkaBuildData {
  return {
    agentId: '1091',
    level: 60,
    mindscapeLevel: 0,
    wEngineRefinement: 1,
    discs: {},
    ...overrides,
  } as EnkaBuildData;
}

describe('EnkaImportService', () => {
  let service: EnkaImportService;

  function hasChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    return (service as any).hasChanges(existing, incoming);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EnkaImportService,
        { provide: BuildService, useValue: {} },
        { provide: DiscService, useValue: {} },
        { provide: DbService, useValue: {} },
      ],
    });
    service = TestBed.inject(EnkaImportService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('hasChanges', () => {
    it('reports a change when the mindscape differs in either direction', () => {
      // Only showcased agents appear in an Enka response, so every reported
      // TalentLevel is real data - including 0. A difference is a difference.
      expect(
        hasChanges(existingBuild({ mindscapeLevel: 6 }), incomingBuild({ mindscapeLevel: 0 }))
      ).toBe(true);
      expect(
        hasChanges(existingBuild({ mindscapeLevel: 0 }), incomingBuild({ mindscapeLevel: 6 }))
      ).toBe(true);
    });

    it('reports a change when a real mindscape upgrade arrives', () => {
      const changed = hasChanges(
        existingBuild({ mindscapeLevel: 2 }),
        incomingBuild({ mindscapeLevel: 5 })
      );
      expect(changed).toBe(true);
    });

    it('reports a change when the agent level differs', () => {
      const changed = hasChanges(
        existingBuild({ level: 50 }),
        incomingBuild({ level: 60 })
      );
      expect(changed).toBe(true);
    });

    it('reports no change for an identical build', () => {
      const changed = hasChanges(
        existingBuild({ level: 60, mindscapeLevel: 3 }),
        incomingBuild({ level: 60, mindscapeLevel: 3 })
      );
      expect(changed).toBe(false);
    });
  });
});
