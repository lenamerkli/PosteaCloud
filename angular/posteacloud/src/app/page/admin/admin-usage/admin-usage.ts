import { Component, inject, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { formatBytes } from '../../../other/format-bytes';
import { AdminService } from '../../../service/admin.service';
import { AdminUsage as AdminUsageModel } from '../../../type/admin-usage';

@Component({
  selector: 'app-admin-usage',
  imports: [MatProgressBarModule],
  templateUrl: './admin-usage.html',
  styleUrl: './admin-usage.sass',
})
export class AdminUsage {
  private readonly adminService = inject(AdminService);

  protected readonly usage = signal<AdminUsageModel | null>(null);
  protected readonly loading = signal(true);

  constructor() {
    this.adminService.getUsage().subscribe({
      next: (usage) => {
        this.usage.set(usage);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  protected percent(used: number, capacity: number): number {
    return capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  }
}