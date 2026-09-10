import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/characters', pathMatch: 'full' },
  {
    path: 'characters',
    loadComponent: () => import('./components/character-tab/character-tab.component').then(m => m.CharacterTabComponent),
    data: { animation: 'CharactersPage' }
  },
  {
    path: 'data-manager',
    loadComponent: () => import('./components/data-manager/data-manager.component').then(m => m.DataManagerComponent),
    data: { animation: 'DataManagerPage' }
  },
  {
    path: 'whats-new',
    loadComponent: () => import('./components/whats-new/whats-new.component').then(m => m.WhatsNewComponent),
    data: { animation: 'WhatsNewPage' }
  },
  {
    path: 'credits',
    loadComponent: () => import('./components/credits/credits.component').then(m => m.CreditsComponent),
    data: { animation: 'CreditsPage' }
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./components/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent),
    data: { animation: 'PrivacyPolicyPage' }
  },
  { path: '**', redirectTo: '/characters' }
];
