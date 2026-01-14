import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-overlay',
  imports: [CommonModule],
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.css',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingOverlayComponent {
  @Input() show = false;
  @Input() message = 'Loading...';
}
