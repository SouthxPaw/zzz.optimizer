import { Component, Input, ChangeDetectionStrategy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-overlay',
  imports: [CommonModule],
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingOverlayComponent implements AfterViewInit {
  @ViewChild('bangbooVideo') bangbooVideo?: ElementRef<HTMLVideoElement>;
  @Input() message = 'Loading...';

  private _show = false;

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
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
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
}
