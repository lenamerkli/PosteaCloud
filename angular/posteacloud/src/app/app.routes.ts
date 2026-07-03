import { Routes } from '@angular/router';

import { authGuard } from './guard/auth.guard';
import { Admin } from './page/admin/admin';
import { FileBrowser } from './page/file-browser/file-browser';
import { Hash } from './page/hash/hash';
import { Login } from './page/login/login';
import { Shell } from './page/shell/shell';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'hash', component: Hash },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: FileBrowser, data: { mode: 'root' } },
      { path: 'partition/:id', component: FileBrowser, data: { mode: 'partition' } },
      { path: 'folder/:id', component: FileBrowser, data: { mode: 'folder' } },
      { path: 'trash', component: FileBrowser, data: { mode: 'trash' } },
      { path: 'shared', component: FileBrowser, data: { mode: 'shared' } },
      { path: 'recent', component: FileBrowser, data: { mode: 'recent' } },
      { path: 'admin', component: Admin },
    ],
  },
  { path: '**', redirectTo: '' },
];