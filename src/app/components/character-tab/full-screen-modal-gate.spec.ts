import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';

import { CharacterTabComponent } from './character-tab.component';

/**
 * The main view is removed from the DOM while a full-screen modal is open, so
 * Angular stops re-rendering ~250 invisible bindings on every modal
 * interaction.
 *
 * Which flags count is the load-bearing part: miss one and the page keeps
 * re-rendering behind that modal (the bug this fixes); include a dialog that
 * only overlays the page and the page vanishes underneath it mid-action.
 */
describe('CharacterTabComponent full-screen modal gate', () => {
  let component: CharacterTabComponent;
  let httpMock: HttpTestingController;

  /** Flags that cover the whole screen - the page behind them is hidden. */
  const FULL_SCREEN_FLAGS = [
    'showAddAgentModal',
    'showDiscPicker',
    'showDiscForm',
    'showShareModal',
    'showCompareModal',
    'showLoadoutsModal',
    'showEnkaImportModal',
  ] as const;

  /**
   * Flags that must NOT hide the page.
   *
   * Confirm and info dialogs render over the page rather than replacing it.
   * showWEnginePicker is different again - an inline expanding panel inside
   * the main view, so hiding the page would unmount the panel itself.
   */
  const OVERLAY_FLAGS = [
    'showConfirmDialog',
    'showInfoDialog',
    'showWEnginePicker',
  ] as const;

  beforeEach(() => {
    spyOn(console, 'error');
    spyOn(console, 'warn');
    spyOn(console, 'log');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            versionUpdates: EMPTY,
            unrecoverable: EMPTY,
            checkForUpdate: () => Promise.resolve(false),
            activateUpdate: () => Promise.resolve(false),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(CharacterTabComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    httpMock.match(() => true).forEach(r => r.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  afterEach(() => {
    httpMock.match(() => true).forEach(r => r.flush({}, { status: 404, statusText: 'Not Found' }));
  });

  it('reports no full-screen modal by default', () => {
    expect(component.isFullScreenModalOpen()).toBe(false);
  });

  FULL_SCREEN_FLAGS.forEach(flag => {
    it(`treats ${flag} as full-screen`, () => {
      (component as any)[flag] = true;
      expect(component.isFullScreenModalOpen()).toBe(true);
      (component as any)[flag] = false;
      expect(component.isFullScreenModalOpen()).toBe(false);
    });
  });

  OVERLAY_FLAGS.forEach(flag => {
    it(`does not hide the page for ${flag}`, () => {
      // These render over the page rather than replacing it - hiding the
      // content behind them would blank the screen mid-action.
      (component as any)[flag] = true;
      expect(component.isFullScreenModalOpen()).toBe(false);
    });
  });

  it('stays true while any one of several open modals remains', () => {
    component.showLoadoutsModal = true;
    component.showDiscPicker = true;
    expect(component.isFullScreenModalOpen()).toBe(true);

    // Closing the picker from inside the loadouts modal must not reveal the
    // page while the loadouts modal is still covering it.
    component.showDiscPicker = false;
    expect(component.isFullScreenModalOpen()).toBe(true);

    component.showLoadoutsModal = false;
    expect(component.isFullScreenModalOpen()).toBe(false);
  });
});
