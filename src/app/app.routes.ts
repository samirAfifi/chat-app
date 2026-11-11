import { Routes } from '@angular/router';
import { authGuard } from './Authentication/guards/Authentication/guards/auth-guard';
import { guestGuard } from './Authentication/guards/Authentication/guards/guest-guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./Authentication/Components/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./Authentication/Components/register/register').then((m) => m.Register),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () => import('./Chat/Components/chat/chat').then((m) => m.Chat),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./Profile/Components/profile/profile').then((m) => m.Profile),
  },
  { path: '', pathMatch: 'full', redirectTo: 'chat' },
  { path: '**', redirectTo: 'chat' },
];
