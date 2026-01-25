import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ImagePreloaderService {
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
   * Preload multiple images with priority support
   */
  async preloadImages(srcs: string[], priority: 'high' | 'low' = 'low'): Promise<void> {
    const uniqueSrcs = [...new Set(srcs.filter(src => src && src.trim() !== ''))];

    if (priority === 'high') {
      // Preload high-priority images immediately (first 10)
      const highPriority = uniqueSrcs.slice(0, 10);
      await Promise.allSettled(highPriority.map(src => this.preloadImage(src)));

      // Preload remaining in background
      if (uniqueSrcs.length > 10) {
        setTimeout(() => {
          Promise.allSettled(uniqueSrcs.slice(10).map(src => this.preloadImage(src)));
        }, 100);
      }
    } else {
      // Low priority: preload all concurrently
      await Promise.allSettled(uniqueSrcs.map(src => this.preloadImage(src)));
    }
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
   * Cleanup
   */
  destroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }
}
