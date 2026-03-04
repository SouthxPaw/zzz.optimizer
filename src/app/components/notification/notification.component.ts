import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService, Notification } from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  imports: [CommonModule],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationComponent implements OnInit, OnDestroy {
  notification: Notification | null = null;
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
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close() {
    this.notificationService.hide();
  }

  onAction() {
    if (this.notification?.action) {
      this.notification.action.callback();
      this.close();
    }
  }
}
