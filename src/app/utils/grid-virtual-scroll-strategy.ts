// utils/grid-virtual-scroll-strategy.ts
import { CdkVirtualScrollViewport, VirtualScrollStrategy } from '@angular/cdk/scrolling';
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

/**
 * Virtual scroll strategy for CSS Grid layouts
 * Handles dynamic column counts based on viewport width
 */
@Injectable()
export class GridVirtualScrollStrategy implements VirtualScrollStrategy {
  private viewport: CdkVirtualScrollViewport | null = null;
  private itemHeight!: number;
  private minItemWidth!: number;
  private gap!: number;

  public scrolledIndexChange = new Subject<number>();

  constructor() {}

  /**
   * Configure the strategy
   */
  setConfig(itemHeight: number, minItemWidth: number, gap: number = 12): void {
    this.itemHeight = itemHeight;
    this.minItemWidth = minItemWidth;
    this.gap = gap;
  }

  attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport;
    this.updateRenderedRange();
  }

  detach(): void {
    this.scrolledIndexChange.complete();
    this.viewport = null;
  }

  onContentScrolled(): void {
    this.updateRenderedRange();
  }

  onDataLengthChanged(): void {
    if (this.viewport) {
      this.updateRenderedRange();
      this.viewport.checkViewportSize();
    }
  }

  onContentRendered(): void {}

  onRenderedOffsetChanged(): void {}

  scrollToIndex(index: number, behavior: ScrollBehavior): void {
    if (!this.viewport) return;

    const columnsPerRow = this.getColumnsPerRow();
    const row = Math.floor(index / columnsPerRow);
    const offset = row * (this.itemHeight + this.gap);

    this.viewport.scrollToOffset(offset, behavior);
  }

  /**
   * Calculate number of columns that fit in viewport
   */
  private getColumnsPerRow(): number {
    if (!this.viewport) return 1;

    const viewportWidth = this.viewport.getViewportSize();
    const availableWidth = viewportWidth - this.gap;
    const cols = Math.floor((availableWidth + this.gap) / (this.minItemWidth + this.gap));
    return Math.max(1, cols);
  }

  /**
   * Update which items should be rendered based on scroll position
   */
  private updateRenderedRange(): void {
    if (!this.viewport) return;

    const scrollOffset = this.viewport.measureScrollOffset();
    const viewportSize = this.viewport.getViewportSize();
    const dataLength = this.viewport.getDataLength();

    if (dataLength === 0) {
      this.viewport.setRenderedRange({ start: 0, end: 0 });
      this.viewport.setRenderedContentOffset(0);
      return;
    }

    const columnsPerRow = this.getColumnsPerRow();
    const rowHeight = this.itemHeight + this.gap;

    // Calculate which rows are visible
    const startRow = Math.max(0, Math.floor(scrollOffset / rowHeight) - 1); // -1 for buffer
    const endRow = Math.ceil((scrollOffset + viewportSize) / rowHeight) + 1; // +1 for buffer

    // Convert rows to item indices
    const start = startRow * columnsPerRow;
    const end = Math.min(dataLength, endRow * columnsPerRow);

    // Calculate total content height
    const totalRows = Math.ceil(dataLength / columnsPerRow);
    const totalHeight = totalRows * rowHeight;

    // Set the rendered range and content offset
    this.viewport.setRenderedRange({ start, end });
    this.viewport.setRenderedContentOffset(startRow * rowHeight);
    this.viewport.setTotalContentSize(totalHeight);

    // Emit the first visible index
    this.scrolledIndexChange.next(start);
  }
}
