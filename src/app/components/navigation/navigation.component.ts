import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { SwUpdateService } from '../../services/sw-update.service';
import { environment } from '../../../environments/environment';
import { fadeIn } from '../../animations/route-animations';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeIn]
})
export class NavigationComponent implements OnInit, OnDestroy {
  showWhatsNewBadge = false;
  private destroy$ = new Subject<void>();

  constructor(
    private swUpdateService: SwUpdateService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Subscribe to update availability
    this.swUpdateService.updateAvailable
      .pipe(takeUntil(this.destroy$))
      .subscribe(available => {
        if (available) {
          // Show badge when update is available
          this.showWhatsNewBadge = true;
          this.cdr.markForCheck();
        }
      });

    // Check if there's a new version the user hasn't seen yet
    this.checkForUnseenVersion();

    // Re-check badge status after every navigation (e.g., after visiting What's New page)
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.checkForUnseenVersion();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if there's a new version that user hasn't visited What's New for
   */
  private checkForUnseenVersion(): void {
    const currentVersion = environment.appVersion;
    const lastViewedVersion = localStorage.getItem('last_viewed_version');

    // Show badge if no version stored OR version doesn't match
    const shouldShowBadge = !lastViewedVersion || lastViewedVersion !== currentVersion;

    if (shouldShowBadge !== this.showWhatsNewBadge) {
      this.showWhatsNewBadge = shouldShowBadge;
      this.cdr.markForCheck();
    }
  }
}
