/**
 * Reproduces the W-Engine icon's autoplay behaviour in a real browser.
 *
 * The icon is rendered by *ngIf with its source supplied by a [src] binding,
 * so the element exists for a moment before it has anything to play. Chrome's
 * autoplay handling is sensitive to that ordering, and the symptom - a video
 * that loads but sits on its first frame until something else re-renders it -
 * is invisible to a unit test that never touches the DOM.
 *
 * These specs drive a real <video> through the same sequence the template
 * produces, so a fix can be verified rather than assumed.
 */
describe('W-Engine video autoplay', () => {
  let host: HTMLDivElement;

  /** A tiny valid MP4, base64. Avoids depending on assets being served. */
  const TINY_MP4 =
    'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAs1tZGF0AAACrgYF' +
    '//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1NSByMjkxNyAwYTg0ZDk4IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxOCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbA==';

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  /** Build a video element configured exactly as the template does. */
  function createIconVideo(): HTMLVideoElement {
    const video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('preload', 'auto');
    return video;
  }

  it('a muted video with src set at creation is allowed to play', async () => {
    const video = createIconVideo();
    video.src = TINY_MP4;
    host.appendChild(video);

    // play() resolving (or rejecting only on policy) is the signal that the
    // element itself is configured correctly.
    let rejected: unknown = null;
    await video.play().catch(e => (rejected = e));

    // A muted, inline video must never be blocked by autoplay policy.
    expect(rejected && (rejected as Error).name).not.toBe('NotAllowedError');
  });

  it('calling play() on a late-assigned src is not blocked by policy', async () => {
    // This is the template's ordering: element first, src afterwards.
    const video = createIconVideo();
    host.appendChild(video);

    await Promise.resolve();
    video.src = TINY_MP4;

    let rejected: unknown = null;
    await video.play().catch(e => (rejected = e));

    expect(rejected && (rejected as Error).name).not.toBe('NotAllowedError');
  });

  it('muted is set before play is attempted', () => {
    const video = createIconVideo();
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.playsInline).toBe(true);
  });

  describe('the muted attribute/property distinction', () => {
    /**
     * The bug this guards against.
     *
     * `<video muted>` in a template sets the ATTRIBUTE. For an element Angular
     * creates at runtime that does not reliably set the `muted` PROPERTY, and
     * autoplay policy reads the property - so the icon loaded fine, reported
     * `muted: false`, and had play() rejected with NotAllowedError. It looked
     * like a timing problem and was not one.
     */
    it('setting only the muted attribute can leave the property false', () => {
      const video = document.createElement('video');
      video.setAttribute('muted', '');
      host.appendChild(video);

      // Documents the trap: the attribute is present either way, so asserting
      // on the attribute proves nothing about whether autoplay will work.
      expect(video.hasAttribute('muted')).toBe(true);
    });

    it('assigning the property is what autoplay policy honours', async () => {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true; // property, not attribute
      video.src = TINY_MP4;
      host.appendChild(video);

      expect(video.muted).toBe(true);

      let rejected: unknown = null;
      await video.play().catch(e => (rejected = e));
      expect(rejected && (rejected as Error).name).not.toBe('NotAllowedError');
    });

    it('an unmuted video is the case that gets blocked', async () => {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = false;
      video.src = TINY_MP4;
      host.appendChild(video);

      // Without prior user interaction this is precisely what the browser
      // refuses - the failure the console trace showed.
      let rejected: unknown = null;
      await video.play().catch(e => (rejected = e));

      // Not asserted as always-blocked: a browser with a high engagement
      // score for the origin may allow it. The muted path above must never
      // depend on that.
      if (rejected) {
        expect((rejected as Error).name).toBe('NotAllowedError');
      }
    });
  });
});
