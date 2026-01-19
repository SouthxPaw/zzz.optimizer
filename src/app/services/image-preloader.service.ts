import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ImagePreloaderService {
  private preloadedImages: Set<string> = new Set();
  private preloadPromises: Map<string, Promise<void>> = new Map();

  constructor() {}

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
   * Preload multiple images
   */
  async preloadImages(srcs: string[]): Promise<void> {
    const uniqueSrcs = [...new Set(srcs.filter(src => src && src.trim() !== ''))];

    // Preload all images concurrently
    await Promise.allSettled(
      uniqueSrcs.map(src => this.preloadImage(src))
    );
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
}
