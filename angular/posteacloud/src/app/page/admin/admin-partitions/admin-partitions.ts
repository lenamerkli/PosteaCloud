import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { ConfirmDialog, ConfirmDialogData } from '../../../component/confirm-dialog/confirm-dialog';
import { NamePromptDialog, NamePromptDialogData } from '../../../component/name-prompt-dialog/name-prompt-dialog';
import { AdminService } from '../../../service/admin.service';
import { Account } from '../../../type/account';
import { Drive } from '../../../type/drive';
import { Partition } from '../../../type/partition';

@Component({
  selector: 'app-admin-partitions',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './admin-partitions.html',
  styleUrl: './admin-partitions.sass',
})
export class AdminPartitions {
  private readonly adminService = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly displayedColumns = ['name', 'drive', 'owner', 'capacity', 'actions'];
  protected readonly partitions = signal<Partition[]>([]);
  protected readonly drives = signal<Drive[]>([]);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly loading = signal(true);
  protected readonly showCreateForm = signal(false);

  protected readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    driveId: ['', Validators.required],
    ownerId: ['', Validators.required],
    capacity: [1073741824, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.adminService.getPartitions().subscribe({
      next: (partitions) => {
        this.partitions.set(partitions);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.adminService.getDrives().subscribe((drives) => this.drives.set(drives));
    this.adminService.getAccounts().subscribe((accounts) => this.accounts.set(accounts));
  }

  protected driveName(driveId: string): string {
    return this.drives().find((d) => d.id === driveId)?.name ?? driveId;
  }

  protected ownerName(ownerId: string): string {
    return this.accounts().find((a) => a.id === ownerId)?.username ?? ownerId;
  }

  protected toggleCreateForm(): void {
    this.showCreateForm.update((value) => !value);
  }

  protected submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { name, driveId, ownerId, capacity } = this.createForm.getRawValue();
    this.adminService.createPartition(name, driveId, ownerId, capacity, false).subscribe(() => {
      this.createForm.reset({ name: '', driveId: '', ownerId: '', capacity: 1073741824 });
      this.showCreateForm.set(false);
      this.load();
    });
  }

  protected renamePartition(partition: Partition): void {
    const data: NamePromptDialogData = {
      title: 'Rename partition',
      label: 'Name',
      initialValue: partition.name,
    };
    this.dialog
      .open(NamePromptDialog, { data })
      .afterClosed()
      .subscribe((name: string | null) => {
        if (name) {
          this.adminService.updatePartition(partition.id, { name }).subscribe(() => this.load());
        }
      });
  }

  protected deletePartition(partition: Partition): void {
    const data: ConfirmDialogData = {
      title: 'Delete partition',
      message: `Move partition "${partition.name}" to trash?`,
      confirmLabel: 'Delete',
      destructive: true,
    };
    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.adminService.deletePartition(partition.id).subscribe(() => this.load());
        }
      });
  }
}