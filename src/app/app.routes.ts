import { Routes } from '@angular/router';
import { CharacterTabComponent } from './components/character-tab/character-tab.component';
import { DataManagerComponent } from './components/data-manager/data-manager.component';

export const routes: Routes = [
  { path: '', redirectTo: '/characters', pathMatch: 'full' },
  { path: 'characters', component: CharacterTabComponent },
  { path: 'data-manager', component: DataManagerComponent },
  { path: '**', redirectTo: '/characters' }
];
