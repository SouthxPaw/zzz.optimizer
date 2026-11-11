import { Injectable, OnDestroy } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ImagePreloaderService implements OnDestroy {
  /**
   * Maximum preload requests in flight at once. Matches the per-origin
   * connection limit browsers enforce (~6), so the queue the browser builds
   * behind this is short enough that on-demand loads are not starved.
   */
  private static readonly CONCURRENCY_LIMIT = 6;

  private preloadedImages: Set<string> = new Set();
  private preloadPromises: Map<string, Promise<void>> = new Map();
  private intersectionObserver?: IntersectionObserver;

  constructor() {
    this.initIntersectionObserver();
  }

  /**
   * Initialize IntersectionObserver for lazy loading images
   */
  private initIntersectionObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            const src = img.dataset['src'];
            if (src) {
              img.src = src;
              img.removeAttribute('data-src');
              this.intersectionObserver?.unobserve(img);
            }
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01
      }
    );
  }

  /**
   * Preload a single image
   */
  preloadImage(src: string): Promise<void> {
    // If already preloaded, return immediately
    if (this.preloadedImages.has(src)) {
      return Promise.resolve();
    }

    // If currently loading, return existing promise
    if (this.preloadPromises.has(src)) {
      return this.preloadPromises.get(src)!;
    }

    // Create new preload promise
    const promise = new Promise<void>((resolve) => {
      const img = new Image();

      img.onload = () => {
        this.preloadedImages.add(src);
        this.preloadPromises.delete(src);
        resolve();
      };

      img.onerror = () => {
        this.preloadPromises.delete(src);
        console.warn(`Failed to preload image: ${src}`);
        resolve(); // Resolve anyway to not block other images
      };

      img.src = src;
    });

    this.preloadPromises.set(src, promise);
    return promise;
  }

  /**
   * Preload multiple images with priority support.
   *
   * Requests are issued through a fixed-size window rather than all at once.
   * Browsers cap connections per origin (~6 in Chrome) and queue the surplus,
   * so firing hundreds of requests does not make them arrive sooner - it just
   * puts whatever the user needs next behind a long queue of icons. Keeping the
   * window near the connection limit leaves the browser's own scheduler room to
   * prioritise on-demand loads.
   *
   * 'high' awaits the first window so above-the-fold images are ready when this
   * resolves, then finishes the remainder in the background. 'low' resolves only
   * once everything has been fetched.
   */
  async preloadImages(srcs: string[], priority: 'high' | 'low' = 'low'): Promise<void> {
    const uniqueSrcs = [...new Set(srcs.filter(src => src && src.trim() !== ''))];
    if (uniqueSrcs.length === 0) {
      return;
    }

    if (priority === 'high') {
      const firstWindow = uniqueSrcs.slice(0, ImagePreloaderService.CONCURRENCY_LIMIT);
      const remainder = uniqueSrcs.slice(ImagePreloaderService.CONCURRENCY_LIMIT);

      await Promise.allSettled(firstWindow.map(src => this.preloadImage(src)));

      if (remainder.length > 0) {
        // Deliberately not awaited: the caller only needs the first window.
        void this.preloadWithLimit(remainder);
      }
      return;
    }

    await this.preloadWithLimit(uniqueSrcs);
  }

  /**
   * Work through a list of sources, keeping at most CONCURRENCY_LIMIT requests
   * in flight. Individual failures are absorbed by preloadImage.
   */
  private async preloadWithLimit(srcs: string[]): Promise<void> {
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < srcs.length) {
        const src = srcs[cursor++];
        await this.preloadImage(src);
      }
    };

    const workerCount = Math.min(ImagePreloaderService.CONCURRENCY_LIMIT, srcs.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  /**
   * Observe an image element for lazy loading
   */
  observeImage(img: HTMLImageElement): void {
    if (this.intersectionObserver && img.dataset['src']) {
      this.intersectionObserver.observe(img);
    }
  }

  /**
   * Unobserve an image element
   */
  unobserveImage(img: HTMLImageElement): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.unobserve(img);
    }
  }

  /**
   * Check if an image is preloaded
   */
  isPreloaded(src: string): boolean {
    return this.preloadedImages.has(src);
  }

  /**
   * Get count of preloaded images
   */
  getPreloadedCount(): number {
    return this.preloadedImages.size;
  }

  /**
   * Cleanup. Called by Angular when the root injector is destroyed; also safe to
   * call manually.
   */
  ngOnDestroy(): void {
    this.destroy();
  }

  destroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }
}
