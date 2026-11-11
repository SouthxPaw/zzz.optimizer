import { TestBed } from '@angular/core/testing';
import { ImagePreloaderService } from './image-preloader.service';

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
    this.onload?.();
  }
  triggerError(): void {
    this.onerror?.();
  }

  /** Resolve every outstanding fake image created so far. */
  static loadAll(): void {
    FakeImage.instances.forEach(i => i.triggerLoad());
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

    it("high priority issues at most 10 requests synchronously", async () => {
      const p = service.preloadImages(many(40), 'high');
      // The first batch is capped at 10; the rest is deferred.
      expect(FakeImage.instances.length).toBe(10);
      FakeImage.loadAll();
      await p;
    });

    it('eventually requests every image at high priority', async () => {
      const srcs = many(14);
      const p = service.preloadImages(srcs, 'high');
      FakeImage.loadAll();
      await p;

      // Deferred remainder is scheduled on a timer in the implementation.
      await new Promise(r => setTimeout(r, 150));
      FakeImage.loadAll();

      // Every requested src should have been fetched exactly once.
      const requested = new Set(FakeImage.instances.map(i => i.src));
      srcs.forEach(src => expect(requested.has(src)).toBe(true));
    });

    /**
     * BASELINE (pre-optimisation): the default 'low' priority fans out every
     * source at once with no concurrency cap. This test documents current
     * behaviour so the batching fix has something to change deliberately.
     * See the perf work on preload concurrency.
     */
    it('BASELINE: low priority fans out all requests at once (no cap)', async () => {
      const p = service.preloadImages(many(40));
      expect(FakeImage.instances.length).toBe(40);
      FakeImage.loadAll();
      await p;
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
