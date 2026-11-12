import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DiscSetPickerComponent } from './disc-set-picker.component';
import { DiscSet } from '../../services/disc-set.service';

/**
 * The picker owns its own filtering now that it is a separate component, so
 * the behaviour that used to live in CharacterTabComponent is covered here.
 */
describe('DiscSetPickerComponent', () => {
  let fixture: ComponentFixture<DiscSetPickerComponent>;
  let component: DiscSetPickerComponent;

  const SETS: DiscSet[] = [
    {
      id: '1',
      name: 'Woodpecker Electro',
      icon: 'woodpecker.webp',
      bonuses: [
        { pieces: 2, description: 'CRIT Rate +8%' },
        { pieces: 4, description: 'Critical hits increase ATK' },
      ],
    },
    {
      id: '2',
      name: 'Puffer Electro',
      icon: 'puffer.webp',
      bonuses: [{ pieces: 2, description: 'PEN Ratio +8%' }],
    },
    {
      id: '3',
      name: 'Swing Jazz',
      bonuses: [{ pieces: 2, description: 'Energy Regen +20%' }],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiscSetPickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscSetPickerComponent);
    component = fixture.componentInstance;
    component.discSets = SETS;
    fixture.detectChanges();
  });

  it('is created', () => {
    expect(component).toBeTruthy();
  });

  it('lists every set before any filtering', () => {
    expect(component.filteredDiscSets.length).toBe(3);
  });

  /**
   * Regression: the search subject carries no value, so a
   * distinctUntilChanged() on it compared undefined to undefined and dropped
   * every emission after the first - the filters looked completely dead from
   * the second keystroke onward. A single-search test passes happily against
   * that bug, so these drive several searches in a row.
   */
  describe('successive searches', () => {
    it('re-filters on every change, not just the first', fakeAsync(() => {
      component.searchTerm = 'electro';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.length).toBe(2);

      component.searchTerm = 'swing';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.map(s => s.name)).toEqual(['Swing Jazz']);

      component.searchTerm = 'puffer';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.map(s => s.name)).toEqual(['Puffer Electro']);
    }));

    it('restores the full list when a search is cleared', fakeAsync(() => {
      component.searchTerm = 'swing';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.length).toBe(1);

      component.searchTerm = '';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.length).toBe(3);
    }));

    it('re-filters when the effect search changes after a name search', fakeAsync(() => {
      component.searchTerm = 'electro';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.length).toBe(2);

      component.effectSearchTerm = 'PEN';
      component.onSearchChange();
      tick(250);
      expect(component.filteredDiscSets.map(s => s.name)).toEqual(['Puffer Electro']);
    }));
  });

  describe('name search', () => {
    it('matches on a partial name, case-insensitively', fakeAsync(() => {
      component.searchTerm = 'electro';
      component.onSearchChange();
      tick(250);

      expect(component.filteredDiscSets.map(s => s.name).sort())
        .toEqual(['Puffer Electro', 'Woodpecker Electro']);
    }));

    it('returns nothing for a name that does not match', fakeAsync(() => {
      component.searchTerm = 'nonexistent';
      component.onSearchChange();
      tick(250);

      expect(component.filteredDiscSets.length).toBe(0);
    }));

    it('ignores surrounding whitespace', fakeAsync(() => {
      component.searchTerm = '  Swing  ';
      component.onSearchChange();
      tick(250);

      expect(component.filteredDiscSets.length).toBe(1);
    }));
  });

  describe('effect search', () => {
    it('matches text inside a bonus description', fakeAsync(() => {
      component.effectSearchTerm = 'PEN';
      component.onSearchChange();
      tick(250);

      expect(component.filteredDiscSets.map(s => s.name)).toEqual(['Puffer Electro']);
    }));

    it('matches a 4-piece description as well as a 2-piece', fakeAsync(() => {
      component.effectSearchTerm = 'increase ATK';
      component.onSearchChange();
      tick(250);

      expect(component.filteredDiscSets.map(s => s.name)).toEqual(['Woodpecker Electro']);
    }));
  });

  it('applies name and effect filters together', fakeAsync(() => {
    component.searchTerm = 'electro';
    component.effectSearchTerm = 'CRIT';
    component.onSearchChange();
    tick(250);

    expect(component.filteredDiscSets.map(s => s.name)).toEqual(['Woodpecker Electro']);
  }));

  describe('outputs', () => {
    it('emits the chosen set', () => {
      const emitted: DiscSet[] = [];
      component.setSelected.subscribe(s => emitted.push(s));

      component.select(SETS[0]);

      expect(emitted).toEqual([SETS[0]]);
    });

    it('emits on close', () => {
      let closed = 0;
      component.closed.subscribe(() => closed++);

      component.close();

      expect(closed).toBe(1);
    });
  });

  describe('trackBy', () => {
    it('tracks sets by name so rows survive re-filtering', () => {
      expect(component.trackByDiscSetName(0, SETS[0])).toBe('Woodpecker Electro');
    });

    it('tracks bonuses by index', () => {
      expect(component.trackByBonusIndex(2)).toBe(2);
    });
  });

  it('cleans up its subscription on destroy', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
