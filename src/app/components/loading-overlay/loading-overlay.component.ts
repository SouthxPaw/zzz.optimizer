import { Component, Input, ChangeDetectionStrategy, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate, state } from '@angular/animations';

@Component({
  selector: 'app-loading-overlay',
  imports: [CommonModule],
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideOut', [
      transition(':leave', [
        animate('600ms cubic-bezier(0.4, 0, 0.2, 1)', style({
          transform: 'translateX(100%)'
        }))
      ])
    ])
  ]
})
export class LoadingOverlayComponent implements AfterViewInit, OnDestroy {
  @ViewChild('bangbooVideo') bangbooVideo?: ElementRef<HTMLVideoElement>;
  @Input() message = 'Loading...';

  private _show = false;
  private playVideoTimeout: any;

  @Input()
  set show(value: boolean) {
    this._show = value;
    if (value) {
      // Try to play video when loading overlay becomes visible
      this.playVideo();
    }
  }

  get show(): boolean {
    return this._show;
  }

  ngAfterViewInit(): void {
    // If component is already showing when view initializes, play the video
    if (this._show) {
      this.playVideo();
    }
  }

  private playVideo(): void {
    // Clear any existing timeout
    if (this.playVideoTimeout) {
      clearTimeout(this.playVideoTimeout);
    }

    // Use setTimeout to ensure DOM is ready
    this.playVideoTimeout = setTimeout(() => {
      if (this.bangbooVideo?.nativeElement) {
        const video = this.bangbooVideo.nativeElement;

        // Explicitly set muted to true BEFORE calling play
        // This is critical for browser autoplay policies
        video.muted = true;
        video.setAttribute('muted', 'true');

        video.play().catch(err => {
          // Autoplay failed - this is expected in some browsers/contexts
          console.warn('[Loading Overlay] Video autoplay blocked:', err);
        });
      }
    }, 0);
  }

  ngOnDestroy(): void {
    // Clean up timeout on component destruction
    if (this.playVideoTimeout) {
      clearTimeout(this.playVideoTimeout);
    }
  }
}
