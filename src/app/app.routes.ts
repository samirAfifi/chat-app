import { Routes } from '@angular/router';
import { authGuard } from './Authentication/guards/Authentication/guards/auth-guard';



export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./Authentication/Components/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./Authentication/Components/register/register').then((m) => m.Register),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () => import('./Chat/Components/chat/chat').then((m) => m.Chat),
  },
  { path: '', pathMatch: 'full', redirectTo: 'chat' },
  { path: '**', redirectTo: 'login' },
];