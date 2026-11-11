import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SkillParserService, SkillMultiplier } from './skill-parser.service';

describe('SkillParserService', () => {
  let service: SkillParserService;
  let httpMock: HttpTestingController;

  function setMultipliers(data: { [agentId: string]: SkillMultiplier }): void {
    (service as any).skillMultipliers = data;
    (service as any).loaded = true;
  }

  const sample: SkillMultiplier = {
    agentId: '1061',
    agentName: 'Corin',
    averageMultiplier: 420,
    basicAttack: 100,
    specialAttack: 200,
    exSpecialAttack: 300,
    ultimate: 600,
  };

  beforeEach(() => {
    spyOn(console, 'error');
    spyOn(console, 'warn');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SkillParserService],
    });
    service = TestBed.inject(SkillParserService);
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.match(() => true).forEach(r => r.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  afterEach(() => {
    httpMock.match(() => true).forEach(r => r.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('areMultipliersLoaded', () => {
    it('reports a boolean', () => {
      expect(typeof service.areMultipliersLoaded()).toBe('boolean');
    });

    it('is true once data is present', () => {
      setMultipliers({ '1061': sample });
      expect(service.areMultipliersLoaded()).toBe(true);
    });
  });

  describe('getAgentMultiplier', () => {
    it('returns a number for an unknown agent rather than throwing', () => {
      setMultipliers({});
      expect(typeof service.getAgentMultiplier('nope')).toBe('number');
    });

    it('returns the average multiplier for a known agent', () => {
      setMultipliers({ '1061': sample });
      expect(service.getAgentMultiplier('1061')).toBe(420);
    });

    it('never returns NaN', () => {
      setMultipliers({});
      expect(Number.isNaN(service.getAgentMultiplier('nope'))).toBe(false);
    });
  });

  describe('getAgentSkillBreakdown', () => {
    it('returns null for an unknown agent', () => {
      setMultipliers({});
      expect(service.getAgentSkillBreakdown('nope')).toBeNull();
    });

    it('returns the full breakdown for a known agent', () => {
      setMultipliers({ '1061': sample });
      const breakdown = service.getAgentSkillBreakdown('1061');
      expect(breakdown).toBeTruthy();
      expect(breakdown!.agentName).toBe('Corin');
      expect(breakdown!.ultimate).toBe(600);
    });
  });

  describe('getAllMultipliers', () => {
    it('returns an object', () => {
      expect(typeof service.getAllMultipliers()).toBe('object');
    });

    it('includes every loaded agent', () => {
      setMultipliers({ '1061': sample, '1062': { ...sample, agentId: '1062' } });
      expect(Object.keys(service.getAllMultipliers()).sort()).toEqual(['1061', '1062']);
    });
  });
});
