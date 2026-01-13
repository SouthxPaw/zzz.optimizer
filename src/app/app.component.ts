import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavigationComponent } from './components/navigation/navigation.component';
import { FooterComponent } from './components/footer/footer.component';
import { LoadingOverlayComponent } from './components/loading-overlay/loading-overlay.component';
import { NotificationComponent } from './components/notification/notification.component';
import { AppInitService } from './services/app-init.service';
import { LoadingService } from './services/loading.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, NavigationComponent, FooterComponent, LoadingOverlayComponent, NotificationComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'zzz.optimizer';
  isLoading = false;
  loadingMessage = 'Loading...';

  constructor(
    private appInit: AppInitService,
    private loadingService: LoadingService
  ) {}

  async ngOnInit() {
    // Subscribe to loading state
    this.loadingService.loading$.subscribe(loading => {
      this.isLoading = loading;
    });

    this.loadingService.message$.subscribe(message => {
      this.loadingMessage = message;
    });

    // Auto-load reference data on app startup
    await this.appInit.initialize();
  }
}
