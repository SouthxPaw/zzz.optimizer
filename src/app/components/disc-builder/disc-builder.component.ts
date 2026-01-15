import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DiscService } from '../../services/disc.service';
import { AgentService } from '../../services/agent.service';
import { Disc, DiscSet } from '../../models/disc.model';
import { Agent, DiscSlot } from '../../models/agent.model';
import { ScoringAlgorithm } from '../../models/scoring.model';
import { SCORING_PRESETS } from '../../constants/scoring-presets';
import { calculateRollCount } from '../../constants/substat-rolls';

@Component({
  selector: 'app-disc-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './disc-builder.component.html',
  styleUrls: ['./disc-builder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiscBuilderComponent implements OnInit, OnDestroy {
  discs: Disc[] = [];
  filteredDiscs: Disc[] = [];
  paginatedDiscs: Disc[] = [];
  agents: Agent[] = [];

  selectedDisc: Disc | null = null;
  selectedAgentForScoring: Agent | null = null;
  currentAlgorithm: ScoringAlgorithm = SCORING_PRESETS.Attack;

  // Bulk selection
  bulkSelectionMode = false;
  selectedDiscUids = new Set<string>();

  slotFilter: DiscSlot | null = null;
  setFilter = '';
  private setFilterSubject = new Subject<string>();
  showLockedOnly = false;
  showUnequippedOnly = false;

  sortBy = 'score';
  showWeights = false;
  isLoading = true;

  currentPage = 1;
  itemsPerPage = 12;
  totalPages = 1;

  constructor(
    private discService: DiscService,
    private agentService: AgentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.agents = this.agentService.getAgents();
    this.discService.discs$.subscribe((discs) => {
      // Add roll counts to substats for display
      this.discs = discs.map(disc => ({
        ...disc,
        subStats: disc.subStats.map(sub => ({
          ...sub,
          rolls: calculateRollCount(sub.type, sub.value)
        }))
      }));
      this.applyFilters();
      this.isLoading = false;
      this.cdr.markForCheck();
    });

    // Debounce the set filter input
    this.setFilterSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.applyFilters();
      });
  }

  ngOnDestroy() {
    this.setFilterSubject.complete();
  }

  onSetFilterChange(value: string) {
    this.setFilter = value;
    this.setFilterSubject.next(value);
  }

  applyFilters() {
    let filtered = [...this.discs];

    if (this.slotFilter) {
      filtered = filtered.filter((d) => d.slot === this.slotFilter);
    }

    if (this.setFilter) {
      const searchLower = this.setFilter.toLowerCase();
      filtered = filtered.filter((d) => {
        // Search in set name
        if (d.set.toLowerCase().includes(searchLower)) return true;

        // Search in main stat type (format it first)
        const formattedMainStat = this.formatStatType(d.mainStat.type).toLowerCase();
        if (formattedMainStat.includes(searchLower)) return true;

        // Search in substats
        const hasMatchingSubstat = d.subStats.some(sub => {
          const formattedSubStat = this.formatStatType(sub.type).toLowerCase();
          return formattedSubStat.includes(searchLower);
        });
        if (hasMatchingSubstat) return true;

        return false;
      });
    }

    if (this.showLockedOnly) {
      filtered = filtered.filter((d) => d.lock);
    }

    if (this.showUnequippedOnly) {
      filtered = filtered.filter((d) => !d.equippedBy);
    }

    this.filteredDiscs = filtered;
    this.applySort();
  }

  applySort() {
    const sorted = [...this.filteredDiscs];

    const RARITY_VALUE: { [key in Disc['rarity']]: number } = {
      S: 3,
      A: 2,
      B: 1,
    };

    switch (this.sortBy) {
      case 'score':
        sorted.sort((a, b) => this.getScore(b) - this.getScore(a));
        break;
      case 'level':
        sorted.sort((a, b) => b.level - a.level);
        break;
      case 'rarity':
        sorted.sort((a, b) => RARITY_VALUE[b.rarity] - RARITY_VALUE[a.rarity]);
        break;
      case 'slot':
        sorted.sort((a, b) => a.slot.localeCompare(b.slot));
        break;
      case 'set':
        sorted.sort((a, b) => a.set.localeCompare(b.set));
        break;
      case 'potential':
        sorted.sort(
          (a, b) =>
            this.getPotential(b).maxPotential -
            this.getPotential(a).maxPotential
        );
        break;
    }

    this.filteredDiscs = sorted;
    this.totalPages = Math.ceil(this.filteredDiscs.length / this.itemsPerPage);
    this.updatePagination();
  }

  updatePagination() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedDiscs = this.filteredDiscs.slice(start, end);
    this.cdr.markForCheck();
  }

  changePage(page: number) {
    this.currentPage = page;
    this.updatePagination();
  }

  onScoringAgentChange() {
    if (this.selectedAgentForScoring) {
      this.currentAlgorithm =
        SCORING_PRESETS[this.selectedAgentForScoring.specialty];
    }
    this.applySort();
  }

  selectDisc(disc: Disc) {
    this.selectedDisc = disc;
  }

  getScore(disc: Disc): number {
    if (!this.selectedAgentForScoring) return 0;
    return this.discService.scoreDisc(disc, this.currentAlgorithm);
  }

  getPotential(disc: Disc) {
    return this.discService.calculatePotential(disc);
  }

  getRecommendation(disc: Disc): string {
    const score = this.getScore(disc);
    const potential = this.getPotential(disc);

    if (score >= 20)
      return 'S';
    if (score >= 15)
      return 'A';
    if (score >= 10 && potential.maxPotential >= 15)
      return 'B';
    if (score < 10 && disc.level < 9)
      return 'C';
    return 'F';
  }

  toggleLock(disc: Disc) {
    this.discService.updateDisc(disc.uid, { lock: !disc.lock });
  }

  deleteDisc(disc: Disc) {
    if (confirm('Are you sure you want to delete this disc?')) {
      this.discService.deleteDisc(disc.uid);
      this.selectedDisc = null;
    }
  }

  formatSlot(slot: DiscSlot): string {
    return slot.replace('Drive', 'Slot ');
  }

  formatStatType(type: string): string {
    return type.replace(/_/g, ' ').replace('DMG', 'DMG%');
  }

  getWeightedStats() {
    return Object.entries(this.currentAlgorithm.weights).map(
      ([name, weight]) => ({
        name: this.formatStatType(name),
        weight,
      })
    );
  }

  getSRankCount(): number {
    return this.discs.filter((d) => d.rarity === 'S').length;
  }

  // Bulk selection methods
  toggleBulkSelectionMode() {
    this.bulkSelectionMode = !this.bulkSelectionMode;
    if (!this.bulkSelectionMode) {
      this.selectedDiscUids.clear();
    }
  }

  toggleDiscSelection(uid: string) {
    if (this.selectedDiscUids.has(uid)) {
      this.selectedDiscUids.delete(uid);
    } else {
      this.selectedDiscUids.add(uid);
    }
    this.cdr.markForCheck();
  }

  selectAllVisible() {
    this.paginatedDiscs.forEach(disc => {
      this.selectedDiscUids.add(disc.uid);
    });
    this.cdr.markForCheck();
  }

  deselectAll() {
    this.selectedDiscUids.clear();
    this.cdr.markForCheck();
  }

  async bulkDelete() {
    if (this.selectedDiscUids.size === 0) return;

    if (confirm(`Are you sure you want to delete ${this.selectedDiscUids.size} disc(s)?`)) {
      try {
        for (const uid of this.selectedDiscUids) {
          await this.discService.deleteDisc(uid);
        }
        this.selectedDiscUids.clear();
      } catch (error) {
        console.error('Error deleting discs:', error);
        alert('Error deleting some discs');
      }
    }
  }

  // async bulkLock() {
  //   if (this.selectedDiscUids.size === 0) return;

  //   try {
  //     for (const uid of this.selectedDiscUids) {
  //       const disc = this.discs.find(d => d.uid === uid);
  //       // if (disc && !disc.locked) {
  //       //   await this.discService.toggleDiscLock(uid);
  //       // }
  //     }
  //     this.selectedDiscUids.clear();
  //     this.bulkSelectionMode = false;
  //   } catch (error) {
  //     console.error('Error locking discs:', error);
  //     alert('Error locking some discs');
  //   }
  // }

  // async bulkUnlock() {
  //   if (this.selectedDiscUids.size === 0) return;

  //   try {
  //     for (const uid of this.selectedDiscUids) {
  //       const disc = this.discs.find(d => d.uid === uid);
  //       // if (disc && disc.locked) {
  //       //   await this.discService.toggleDiscLock(uid);
  //       // }
  //     }
  //     this.selectedDiscUids.clear();
  //     this.bulkSelectionMode = false;
  //   } catch (error) {
  //     console.error('Error unlocking discs:', error);
  //     alert('Error unlocking some discs');
  //   }
  // }

  // TrackBy functions for performance optimization
  trackByDiscUid(index: number, disc: Disc): string {
    return disc.uid;
  }

  trackByAgentId(index: number, agent: Agent): string {
    return agent.id;
  }

  trackBySlotIndex(index: number, slot: DiscSlot): string {
    return slot;
  }

  trackBySubStatIndex(index: number, _subStat: unknown): number {
    return index;
  }

  trackByPageNumber(index: number, page: number): number {
    return page;
  }
}
