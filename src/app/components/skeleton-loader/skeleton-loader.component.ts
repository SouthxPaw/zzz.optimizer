import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './skeleton-loader.component.html',
  styleUrl: './skeleton-loader.component.css'
})
export class SkeletonLoaderComponent {
  @Input() type: 'text' | 'card' | 'circle' | 'rect' = 'text';
  @Input() width: string = '100%';
  @Input() height: string = 'auto';
  @Input() count: number = 1;
  @Input() className: string = '';

  get items(): number[] {
    return Array(this.count).fill(0);
  }

  get skeletonClass(): string {
    const baseClass = 'skeleton';
    const typeClasses = {
      text: 'skeleton-text',
      card: 'skeleton-card',
      circle: 'rounded-full',
      rect: ''
    };

    return `${baseClass} ${typeClasses[this.type]} ${this.className}`;
  }

  get skeletonStyle(): object {
    const style: any = {};

    if (this.width !== '100%') {
      style.width = this.width;
    }

    if (this.height !== 'auto') {
      style.height = this.height;
    } else {
      // Default heights for different types
      if (this.type === 'text') {
        style.height = '1rem';
      } else if (this.type === 'card') {
        style.height = '8rem';
      } else if (this.type === 'circle') {
        style.height = this.width; // Circle should be square
      }
    }

    return style;
  }
}
