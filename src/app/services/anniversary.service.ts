import { Injectable } from '@angular/core';
import { NotificationService } from './notification.service';
import confetti from 'canvas-confetti';

@Injectable({
  providedIn: 'root'
})
export class AnniversaryService {
  private readonly ANNIVERSARY_MONTH = 0; // January (0-indexed)
  private readonly ANNIVERSARY_DAY = 10;
  private readonly FLAG_KEY_PREFIX = 'anniversary_confetti_shown_';

  constructor(private notificationService: NotificationService) {}

  /**
   * Check if today is the anniversary and show confetti if not already shown this year
   */
  checkAndCelebrate(): void {
    const today = new Date();
    const currentYear = today.getFullYear();
    const isAnniversary = today.getMonth() === this.ANNIVERSARY_MONTH &&
                          today.getDate() === this.ANNIVERSARY_DAY;

    if (!isAnniversary) {
      return; // Not the anniversary, do nothing
    }

    // Check if confetti was already shown this year
    const flagKey = `${this.FLAG_KEY_PREFIX}${currentYear}`;
    const alreadyShown = localStorage.getItem(flagKey) === 'true';

    if (alreadyShown) {
      return; // Already celebrated this year
    }

    // Show confetti celebration!
    this.triggerCelebration();

    // Store flag so it only shows once this year
    localStorage.setItem(flagKey, 'true');
  }

  /**
   * Trigger the confetti animation and thank you message
   * Uses the same approach as the working gachavfortnite implementation
   */
  private triggerCelebration(): void {
    // Beautiful confetti burst covering the screen
    const duration = 3000; // 3 seconds
    const end = Date.now() + duration;
    let animationFrame = 0;

    const frame = () => {
      animationFrame++;

      // Fire confetti every 3 frames to reduce lag while maintaining visual density
      if (animationFrame % 3 === 0) {
        // Create 3 bursts spread across the screen
        for (let i = 0; i < 3; i++) {
          confetti({
            particleCount: 5,
            angle: 90,
            spread: 120,
            origin: { x: Math.random(), y: 0 },
            colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F38181', '#95E1D3'],
            gravity: 2.2,
            scalar: 1.8,
            drift: Math.random() * 0.3 - 0.15,
            ticks: 250,
            startVelocity: 60,
            decay: 0.92,
            flat: false
          });
        }
      }

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();

    // Show thank you message after 500ms so user sees confetti first
    setTimeout(() => {
      this.notificationService.show(
        '🎉 Happy 1 Year Anniversary! 🎉\n\nThank you so much for using ZZZ Optimizer! Your support means the world to me. Here\'s to another year of optimizing builds together!',
        'success',
        12000 // Show for 12 seconds
      );
    }, 500);
  }
}
