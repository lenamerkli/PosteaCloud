import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AccountService } from '../../service/account.service';
import { StorageService } from '../../service/storage.service';
import { formatBytes } from '../../other/format-bytes';

@Component({
  selector: 'app-side-nav',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.sass',
})
export class SideNav implements OnInit {
  private readonly storageService = inject(StorageService);
  protected readonly accountService = inject(AccountService);

  protected readonly usedPercent = signal(0);
  protected readonly usedLabel = signal('');

  ngOnInit(): void {
    this.storageService.getUsage().subscribe({
      next: (usage) => {
        const percent =
          usage.totalCapacity > 0 ? Math.min(100, (usage.totalUsed / usage.totalCapacity) * 100) : 0;
        this.usedPercent.set(percent);
        this.usedLabel.set(`${formatBytes(usage.totalUsed)} / ${formatBytes(usage.totalCapacity)}`);
      },
    });
  }

  protected logout(): void {
    this.accountService.logout().subscribe(() => {
      window.location.href = '/login';
    });
  }
}