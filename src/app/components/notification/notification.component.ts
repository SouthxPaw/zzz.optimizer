import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService, Notification } from '../../services/notification.service';
import { slideInRight } from '../../animations/route-animations';

@Component({
  selector: 'app-notification',
  imports: [CommonModule],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [slideInRight]
})
export class NotificationComponent implements OnInit, OnDestroy {
  notification: Notification | null = null;
  isClosing: boolean = false;
  private destroy$ = new Subject<void>();

  constructor(
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.notificationService.notification$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notification => {
        this.notification = notification;
        this.isClosing = false; // Reset closing state when new notification appears
        this.cdr.markForCheck();
      });

    // Listen for hide trigger
    this.notificationService.hide$
      .pipe(takeUntil(this.destroy$))
      .subscribe(shouldHide => {
        if (shouldHide) {
          this.close();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close() {
    // Trigger fade-out animation
    this.isClosing = true;
    this.cdr.markForCheck();

    // Wait for animation to complete before actually hiding
    setTimeout(() => {
      this.notificationService.completeHide();
      this.isClosing = false;
    }, 300); // Match the CSS animation duration
  }

  onAction() {
    if (this.notification?.action) {
      this.notification.action.callback();
      this.close();
    }
  }

  getNotificationBackground(): string {
    if (!this.notification) {
      return '';
    }

    switch (this.notification.type) {
      case 'success':
        return 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
      case 'error':
        return 'linear-gradient(135deg, #dc3545 0%, #e74c3c 100%)';
      case 'warning':
        return 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)';
      case 'info':
        return 'linear-gradient(135deg, #17a2b8 0%, #0dcaf0 100%)';
      default:
        return 'linear-gradient(135deg, #17a2b8 0%, #0dcaf0 100%)';
    }
  }
}
