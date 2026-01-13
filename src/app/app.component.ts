import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavigationComponent } from './components/navigation/navigation.component';
import { FooterComponent } from './components/footer/footer.component';
import { AppInitService } from './services/app-init.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavigationComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'zzz.optimizer';

  constructor(private appInit: AppInitService) {}

  async ngOnInit() {
    // Auto-load reference data on app startup
    await this.appInit.initialize();
  }
}
