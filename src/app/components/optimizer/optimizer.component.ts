import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-optimizer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './optimizer.component.html',
  styleUrls: ['./optimizer.component.css']
})
export class OptimizerComponent {
  // This component just displays scoring documentation
  // No actual optimization functionality
}
