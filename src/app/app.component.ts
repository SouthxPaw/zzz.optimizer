import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NavigationComponent } from './components/navigation/navigation.component';
import { FooterComponent } from './components/footer/footer.component';
import { LoadingOverlayComponent } from './components/loading-overlay/loading-overlay.component';
import { NotificationComponent } from './components/notification/notification.component';
import { UpdateNotificationComponent } from './components/update-notification/update-notification.component';
import { AppInitService } from './services/app-init.service';
import { LoadingService } from './services/loading.service';
import { SwUpdateService } from './services/sw-update.service';
import { SeoService } from './services/seo.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, NavigationComponent, FooterComponent, LoadingOverlayComponent, NotificationComponent, UpdateNotificationComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'zzz.optimizer';
  isLoading = false;
  loadingMessage = 'Loading...';
  private destroy$ = new Subject<void>();

  constructor(
    private appInit: AppInitService,
    private loadingService: LoadingService,
    private swUpdate: SwUpdateService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    // Initialize SEO structured data
    this.seo.addStructuredData();

    // Initialize Service Worker update checking (clears caches on version change)
    await this.swUpdate.init();

    // Subscribe to loading state
    this.loadingService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
      });

    this.loadingService.message$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.loadingMessage = message;
      });

    // Auto-load reference data on app startup
    await this.appInit.initialize();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
