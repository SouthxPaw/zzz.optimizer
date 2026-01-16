import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/characters', pathMatch: 'full' },
  {
    path: 'characters',
    loadComponent: () => import('./components/character-tab/character-tab.component').then(m => m.CharacterTabComponent)
  },
  {
    path: 'data-manager',
    loadComponent: () => import('./components/data-manager/data-manager.component').then(m => m.DataManagerComponent)
  },
  {
    path: 'credits',
    loadComponent: () => import('./components/credits/credits.component').then(m => m.CreditsComponent)
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./components/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent)
  },
  { path: '**', redirectTo: '/characters' }
];
