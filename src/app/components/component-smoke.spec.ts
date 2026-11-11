import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Type } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';

import { CreditsComponent } from './credits/credits.component';
import { FooterComponent } from './footer/footer.component';
import { LoadingOverlayComponent } from './loading-overlay/loading-overlay.component';
import { NavigationComponent } from './navigation/navigation.component';
import { NotificationComponent } from './notification/notification.component';
import { OptimizerComponent } from './optimizer/optimizer.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { SkeletonLoaderComponent } from './skeleton-loader/skeleton-loader.component';
import { UpdateNotificationComponent } from './update-notification/update-notification.component';
import { UpgradePlansComponent } from './upgrade-plans/upgrade-plans.component';
import { WhatsNewComponent } from './whats-new/whats-new.component';
import { DataManagerComponent } from './data-manager/data-manager.component';
import { CharacterTabComponent } from './character-tab/character-tab.component';

/**
 * Smoke tests: every component must construct and complete a first change
 * detection pass without throwing.
 *
 * These are deliberately shallow. Their job is to catch the failure mode the
 * performance work is most likely to introduce - a component that no longer
 * initialises because a dependency became lazy, a template binding was
 * converted to a signal incorrectly, or change detection was reconfigured.
 * They are a tripwire, not a behavioural specification.
 */

/** Components with no required @Input()s, safe to create bare. */
const COMPONENTS: Array<[string, Type<unknown>]> = [
  ['CreditsComponent', CreditsComponent],
  ['FooterComponent', FooterComponent],
  ['LoadingOverlayComponent', LoadingOverlayComponent],
  ['NavigationComponent', NavigationComponent],
  ['NotificationComponent', NotificationComponent],
  ['OptimizerComponent', OptimizerComponent],
  ['PrivacyPolicyComponent', PrivacyPolicyComponent],
  ['SkeletonLoaderComponent', SkeletonLoaderComponent],
  ['UpdateNotificationComponent', UpdateNotificationComponent],
  ['UpgradePlansComponent', UpgradePlansComponent],
  ['WhatsNewComponent', WhatsNewComponent],
  ['DataManagerComponent', DataManagerComponent],
  ['CharacterTabComponent', CharacterTabComponent],
];

describe('component smoke tests', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Components and their services log load failures; the deliberate 404s
    // below would otherwise bury real failures in console noise.
    spyOn(console, 'error');
    spyOn(console, 'warn');
    spyOn(console, 'log');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        // The service worker is not registered under test; SwUpdateService
        // depends on SwUpdate, so supply an inert stand-in.
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
    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Answer every outstanding data request with a 404 so nothing hangs. */
  function flushPendingRequests(): void {
    httpMock.match(() => true).forEach(r =>
      r.flush({}, { status: 404, statusText: 'Not Found' })
    );
  }

  afterEach(() => {
    flushPendingRequests();
  });

  COMPONENTS.forEach(([name, component]) => {
    describe(name, () => {
      it('is created', () => {
        const fixture = TestBed.createComponent(component);
        flushPendingRequests();
        expect(fixture.componentInstance).toBeTruthy();
      });

      it('completes a first change detection pass', () => {
        const fixture = TestBed.createComponent(component);
        expect(() => {
          fixture.detectChanges();
          flushPendingRequests();
        }).not.toThrow();
      });

      it('renders without throwing on a second pass', () => {
        const fixture = TestBed.createComponent(component);
        fixture.detectChanges();
        flushPendingRequests();
        expect(() => fixture.detectChanges()).not.toThrow();
      });

      it('destroys cleanly', () => {
        const fixture = TestBed.createComponent(component);
        fixture.detectChanges();
        flushPendingRequests();
        expect(() => fixture.destroy()).not.toThrow();
      });
    });
  });
});
