import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
// The service's DiscSet (not the model's) is what the catalogue is built from:
// it carries the icon path and uses an open `pieces: number`.
import { DiscSet } from '../../services/disc-set.service';

/**
 * Disc set picker modal.
 *
 * Extracted from CharacterTabComponent so it is its own change detection
 * boundary. Previously every keystroke in the search box re-evaluated that
 * component's ~2,500-line template - the whole builds list, all six disc
 * slots, every summary panel - because the modal lived inside it. With OnPush
 * and local state, typing here only re-renders this list.
 *
 * Filtering stays internal; the parent supplies the catalogue and receives the
 * chosen set, because what happens on selection differs by caller (equipping a
 * slot, editing a loadout, or returning to the compare modal).
 */
@Component({
  selector: 'app-disc-set-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './disc-set-picker.component.html',
  styleUrl: './disc-set-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscSetPickerComponent implements OnInit, OnDestroy {
  /** Full disc set catalogue to filter. */
  @Input() discSets: DiscSet[] = [];

  /** Slot label shown in the header, e.g. "Drive 4". */
  @Input() slotLabel = '';

  /** Raises the stacking order when opened from another modal. */
  @Input() highZ = false;

  @Output() setSelected = new EventEmitter<DiscSet>();
  @Output() closed = new EventEmitter<void>();

  searchTerm = '';
  effectSearchTerm = '';

  filteredDiscSets: DiscSet[] = [];

  private readonly searchChange$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.applyFilters();

    // Debounced so a fast typist does not re-filter on every keystroke.
    //
    // No distinctUntilChanged here: the subject carries the search text, not a
    // void signal. Comparing void emissions would treat every keystroke as
    // identical to the last and suppress all of them after the first, which
    // leaves the filters looking completely dead.
    this.searchChange$
      .pipe(debounceTime(200), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
        // OnPush: the input event already marks this component dirty, but the
        // debounced result arrives outside that cycle.
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(): void {
    this.searchChange$.next();
  }

  private applyFilters(): void {
    const name = this.searchTerm.trim().toLowerCase();
    const effect = this.effectSearchTerm.trim().toLowerCase();

    this.filteredDiscSets = this.discSets.filter(set => {
      if (name && !set.name.toLowerCase().includes(name)) {
        return false;
      }
      if (effect) {
        const match = set.bonuses.some(bonus =>
          bonus.description.toLowerCase().includes(effect),
        );
        if (!match) {
          return false;
        }
      }
      return true;
    });
  }

  select(discSet: DiscSet): void {
    this.setSelected.emit(discSet);
  }

  close(): void {
    this.closed.emit();
  }

  trackByDiscSetName(_index: number, discSet: DiscSet): string {
    return discSet.name;
  }

  trackByBonusIndex(index: number): number {
    return index;
  }
}
