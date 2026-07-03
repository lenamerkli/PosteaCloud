import { Component, inject, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

import { AdminService } from '../../service/admin.service';
import { AdminAccounts } from './admin-accounts/admin-accounts';
import { AdminDrives } from './admin-drives/admin-drives';
import { AdminIps } from './admin-ips/admin-ips';
import { AdminPartitions } from './admin-partitions/admin-partitions';
import { AdminUsage } from './admin-usage/admin-usage';

@Component({
  selector: 'app-admin',
  imports: [MatTabsModule, AdminDrives, AdminPartitions, AdminAccounts, AdminIps, AdminUsage],
  templateUrl: './admin.html',
  styleUrl: './admin.sass',
})
export class Admin {
  private readonly adminService = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly allowed = signal(false);
  protected readonly errorMessage = signal('');

  constructor() {
    this.adminService.getDrives().subscribe({
      next: () => {
        this.allowed.set(true);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        const message =
          (error as { error?: { message?: string } })?.error?.message ??
          'Admin privileges required.';
        this.errorMessage.set(message);
        this.loading.set(false);
      },
    });
  }
}