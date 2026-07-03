import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';

import { ConfirmDialog, ConfirmDialogData } from '../../../component/confirm-dialog/confirm-dialog';
import { NamePromptDialog, NamePromptDialogData } from '../../../component/name-prompt-dialog/name-prompt-dialog';
import { AdminService } from '../../../service/admin.service';
import { Drive } from '../../../type/drive';

@Component({
  selector: 'app-admin-drives',
  imports: [MatButtonModule, MatIconModule, MatTableModule],
  templateUrl: './admin-drives.html',
  styleUrl: './admin-drives.sass',
})
export class AdminDrives {
  private readonly adminService = inject(AdminService);
  private readonly dialog = inject(MatDialog);

  protected readonly displayedColumns = ['name', 'location', 'description', 'actions'];
  protected readonly drives = signal<Drive[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.adminService.getDrives().subscribe({
      next: (drives) => {
        this.drives.set(drives);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected createDrive(): void {
    const nameData: NamePromptDialogData = { title: 'New drive', label: 'Name' };
    this.dialog
      .open(NamePromptDialog, { data: nameData })
      .afterClosed()
      .subscribe((name: string | null) => {
        if (!name) {
          return;
        }
        const locationData: NamePromptDialogData = {
          title: 'New drive',
          label: 'Filesystem location',
        };
        this.dialog
          .open(NamePromptDialog, { data: locationData })
          .afterClosed()
          .subscribe((location: string | null) => {
            if (!location) {
              return;
            }
            this.adminService.createDrive(name, location, '').subscribe(() => this.load());
          });
      });
  }

  protected renameDrive(drive: Drive): void {
    const data: NamePromptDialogData = {
      title: 'Rename drive',
      label: 'Name',
      initialValue: drive.name,
    };
    this.dialog
      .open(NamePromptDialog, { data })
      .afterClosed()
      .subscribe((name: string | null) => {
        if (name) {
          this.adminService.updateDrive(drive.id, { name }).subscribe(() => this.load());
        }
      });
  }

  protected deleteDrive(drive: Drive): void {
    const data: ConfirmDialogData = {
      title: 'Delete drive',
      message: `Delete drive "${drive.name}"? This is only possible if it has no partitions.`,
      confirmLabel: 'Delete',
      destructive: true,
    };
    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.adminService.deleteDrive(drive.id).subscribe(() => this.load());
        }
      });
  }
}