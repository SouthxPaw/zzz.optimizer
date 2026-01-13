import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { version } from '../../../../package.json';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent {
  version = version;
  currentYear = new Date().getFullYear();
}
