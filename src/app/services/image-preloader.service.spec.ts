import { TestBed } from '@angular/core/testing';
import { ImagePreloaderService } from './image-preloader.service';

/**
 * Must match ImagePreloaderService.CONCURRENCY_LIMIT. Kept as a local constant
 * because the service's copy is private.
 */
const CONCURRENCY_LIMIT = 6;

/**
 * Stub for the global Image constructor so specs never hit the network.
 * Each instance records itself and exposes manual load/error triggers.
 */
class FakeImage {
  static instances: FakeImage[] = [];
  static reset(): void {
    FakeImage.instances = [];
  }

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** True once this request has been settled, so specs can measure overlap. */
  resolved = false;
  private _src = '';

  constructor() {
    FakeImage.instances.push(this);
  }

  set src(value: string) {
    this._src = value;
  }
  get src(): string {
    return this._src;
  }

  triggerLoad(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onload?.();
  }
  triggerError(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onerror?.();
  }

  /** Resolve every outstanding fake image created so far. */
  static loadAll(): void {
    FakeImage.instances.filter(i => !i.resolved).forEach(i => i.triggerLoad());
  }
}

describe('ImagePreloaderService', () => {
  let service: ImagePreloaderService;
  let originalImage: typeof Image;

  beforeEach(() => {
    originalImage = window.Image;
    (window as any).Image = FakeImage;
    FakeImage.reset();

    TestBed.configureTestingModule({ providers: [ImagePreloaderService] });
    service = TestBed.inject(ImagePreloaderService);
  });

  afterEach(() => {
    (window as any).Image = originalImage;
    service.destroy();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('preloadImage', () => {
    it('requests the given src', async () => {
      const p = service.preloadImage('a.webp');
      expect(FakeImage.instances.length).toBe(1);
      expect(FakeImage.instances[0].src).toBe('a.webp');
      FakeImage.loadAll();
      await p;
    });

    it('marks the image preloaded after load', async () => {
      const p = service.preloadImage('a.webp');
      expect(service.isPreloaded('a.webp')).toBe(false);
      FakeImage.loadAll();
      await p;
      expect(service.isPreloaded('a.webp')).toBe(true);
      expect(service.getPreloadedCount()).toBe(1);
    });

    it('does not re-request an already preloaded image', async () => {
      const p = service.preloadImage('a.webp');
      FakeImage.loadAll();
      await p;
      expect(FakeImage.instances.length).toBe(1);

      await service.preloadImage('a.webp');
      expect(FakeImage.instances.length).toBe(1);
    });

    it('shares one request between concurrent callers of the same src', async () => {
      const p1 = service.preloadImage('a.webp');
      const p2 = service.preloadImage('a.webp');
      expect(FakeImage.instances.length).toBe(1);
      FakeImage.loadAll();
      await Promise.all([p1, p2]);
    });

    it('resolves rather than rejects when the image fails', async () => {
      const p = service.preloadImage('bad.webp');
      FakeImage.instances[0].triggerError();
      await expectAsync(p).toBeResolved();
    });

    it('does not mark a failed image as preloaded, and allows a retry', async () => {
      const p = service.preloadImage('bad.webp');
      FakeImage.instances[0].triggerError();
      await p;

      expect(service.isPreloaded('bad.webp')).toBe(false);

      // Retry issues a fresh request because the failed promise was cleared.
      const retry = service.preloadImage('bad.webp');
      expect(FakeImage.instances.length).toBe(2);
      FakeImage.loadAll();
      await retry;
      expect(service.isPreloaded('bad.webp')).toBe(true);
    });
  });

  describe('preloadImages', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `img-${i}.webp`);

    it('filters out empty and whitespace-only sources', async () => {
      const p = service.preloadImages(['a.webp', '', '   ', 'b.webp']);
      expect(FakeImage.instances.length).toBe(2);
      FakeImage.loadAll();
      await p;
    });

    it('de-duplicates repeated sources', async () => {
      const p = service.preloadImages(['a.webp', 'a.webp', 'a.webp']);
      expect(FakeImage.instances.length).toBe(1);
      FakeImage.loadAll();
      await p;
    });

    it('resolves on an empty list without issuing requests', async () => {
      await expectAsync(service.preloadImages([])).toBeResolved();
      expect(FakeImage.instances.length).toBe(0);
    });

    it('high priority issues at most one window of requests synchronously', async () => {
      const p = service.preloadImages(many(40), 'high');
      // Only the first concurrency window is issued up front.
      expect(FakeImage.instances.length).toBe(CONCURRENCY_LIMIT);
      FakeImage.loadAll();
      await p;
    });

    /**
     * Requests are created synchronously inside preloadImage, but the windowed
     * workers await between items - so new FakeImages only appear after
     * microtasks drain. Pump load+drain until the queue stops growing.
     */
    async function drain(expected: number): Promise<void> {
      for (let i = 0; i < expected * 4; i++) {
        FakeImage.loadAll();
        await Promise.resolve();
        await Promise.resolve();
        if (new Set(FakeImage.instances.map(x => x.src)).size >= expected) break;
      }
      FakeImage.loadAll();
      await Promise.resolve();
    }

    it('eventually requests every image at high priority', async () => {
      const srcs = many(14);
      const p = service.preloadImages(srcs, 'high');
      await drain(srcs.length);
      await p;
      await drain(srcs.length);

      const requested = new Set(FakeImage.instances.map(i => i.src));
      srcs.forEach(src => expect(requested.has(src)).toBe(true));
    });

    it('caps in-flight requests at low priority instead of fanning out', async () => {
      const srcs = many(40);
      const p = service.preloadImages(srcs);

      // Without a cap all 40 would be requested before the first await.
      expect(FakeImage.instances.length).toBe(CONCURRENCY_LIMIT);

      await drain(srcs.length);
      await p;
    });

    it('still fetches every image when capped', async () => {
      const srcs = many(25);
      const p = service.preloadImages(srcs);
      await drain(srcs.length);
      await p;

      const requested = new Set(FakeImage.instances.map(i => i.src));
      srcs.forEach(src => expect(requested.has(src)).toBe(true));
    });

    it('never exceeds the concurrency limit at any point', async () => {
      const srcs = many(30);
      let peak = 0;

      const p = service.preloadImages(srcs);
      for (let i = 0; i < srcs.length * 4; i++) {
        // Measure overlap before settling this wave.
        peak = Math.max(peak, FakeImage.instances.filter(img => !img.resolved).length);
        if (new Set(FakeImage.instances.map(x => x.src)).size >= srcs.length) break;
        FakeImage.loadAll();
        await Promise.resolve();
        await Promise.resolve();
      }
      FakeImage.loadAll();
      await p;

      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(CONCURRENCY_LIMIT);
    });
  });

  describe('IntersectionObserver lazy loading', () => {
    it('does not throw when observing an element without data-src', () => {
      const img = document.createElement('img');
      expect(() => service.observeImage(img)).not.toThrow();
    });

    it('does not throw when unobserving an untracked element', () => {
      const img = document.createElement('img');
      expect(() => service.unobserveImage(img)).not.toThrow();
    });

    it('observes an element that has data-src', () => {
      const img = document.createElement('img');
      img.dataset['src'] = 'a.webp';
      expect(() => service.observeImage(img)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('destroy() is idempotent', () => {
      service.destroy();
      expect(() => service.destroy()).not.toThrow();
    });

    it('ngOnDestroy delegates to destroy()', () => {
      const spy = spyOn(service, 'destroy').and.callThrough();
      service.ngOnDestroy();
      expect(spy).toHaveBeenCalled();
    });
  });
});
