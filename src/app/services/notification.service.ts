import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface NotificationAction {
  label: string;
  callback: () => void;
}

export interface Notification {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: NotificationAction;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new BehaviorSubject<Notification | null>(null);
  private hideSubject = new BehaviorSubject<boolean>(false);

  notification$ = this.notificationSubject.asObservable();
  hide$ = this.hideSubject.asObservable();

  private hideTimeout: any = null;

  show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 5000, action?: NotificationAction) {
    // Clear any existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.notificationSubject.next({ message, type, duration, action });

    if (duration > 0) {
      this.hideTimeout = setTimeout(() => this.triggerHide(), duration);
    }
  }

  success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }

  warning(message: string, duration?: number) {
    this.show(message, 'warning', duration);
  }

  info(message: string, duration?: number) {
    this.show(message, 'info', duration);
  }

  // Trigger the hide animation
  triggerHide() {
    this.hideSubject.next(true);
  }

  // Actually hide the notification (called after animation completes)
  completeHide() {
    this.notificationSubject.next(null);
    this.hideSubject.next(false);
  }
}
