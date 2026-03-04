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
  notification$ = this.notificationSubject.asObservable();

  show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 5000, action?: NotificationAction) {
    this.notificationSubject.next({ message, type, duration, action });

    if (duration > 0) {
      setTimeout(() => this.hide(), duration);
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

  hide() {
    this.notificationSubject.next(null);
  }
}
