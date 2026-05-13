import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SwUpdateService } from '../../services/sw-update.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-update-notification',
  imports: [CommonModule],
  templateUrl: './update-notification.component.html',
  styleUrl: './update-notification.component.css'
})
export class UpdateNotificationComponent implements OnInit, OnDestroy {
  updateAvailable = false;
  showDevTestButton = !environment.production; // Only show in development
  private destroy$ = new Subject<void>();

  constructor(private swUpdateService: SwUpdateService) {}

  ngOnInit(): void {
    // Subscribe to update availability
    this.swUpdateService.updateAvailable
      .pipe(takeUntil(this.destroy$))
      .subscribe(available => {
        this.updateAvailable = available;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Apply the update (reload the page)
  applyUpdate(): void {
    this.swUpdateService.applyUpdate();
  }

  // DEV ONLY: Manually trigger update notification for testing
  testUpdateNotification(): void {
    this.updateAvailable = true;
  }
}
