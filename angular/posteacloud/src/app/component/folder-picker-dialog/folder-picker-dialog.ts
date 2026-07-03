import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { StorageService } from '../../service/storage.service';
import { Entry } from '../../type/entry';
import { Partition } from '../../type/partition';

export interface FolderPickerDialogData {
  title: string;
  /** When true (default), only folders/partitions the user can write to are shown. */
  requireWrite?: boolean;
}

export interface FolderPickerResult {
  partitionId: string;
  folderId: string | null;
}

interface Crumb {
  label: string;
  partitionId: string | null;
  folderId: string | null;
}

@Component({
  selector: 'app-folder-picker-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './folder-picker-dialog.html',
  styleUrl: './folder-picker-dialog.sass',
})
export class FolderPickerDialog {
  private readonly storageService = inject(StorageService);
  protected readonly dialogRef = inject(MatDialogRef<FolderPickerDialog>);
  protected readonly data = inject<FolderPickerDialogData>(MAT_DIALOG_DATA);

  protected readonly loading = signal(true);
  protected readonly partitions = signal<Partition[]>([]);
  protected readonly folders = signal<Entry[]>([]);
  protected readonly crumbs = signal<Crumb[]>([
    { label: 'Home', partitionId: null, folderId: null },
  ]);
  protected readonly currentPartitionId = signal<string | null>(null);
  protected readonly currentFolderId = signal<string | null>(null);

  constructor() {
    this.loadRoot();
  }

  private loadRoot(): void {
    this.loading.set(true);
    this.storageService.getPartitions().subscribe({
      next: (partitions) => {
        this.partitions.set(partitions.filter((p) => p.canWrite));
        this.folders.set([]);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected openPartition(partition: Partition): void {
    this.loading.set(true);
    this.currentPartitionId.set(partition.id);
    this.currentFolderId.set(null);
    this.crumbs.update((crumbs) => [
      ...crumbs,
      { label: partition.name, partitionId: partition.id, folderId: null },
    ]);
    this.storageService.getPartitionEntries(partition.id).subscribe({
      next: (entries) => {
        this.partitions.set([]);
        this.folders.set(entries.filter((e) => e.type === 'folder' && e.canWrite));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected openFolder(folder: Entry): void {
    this.loading.set(true);
    this.currentFolderId.set(folder.id);
    this.crumbs.update((crumbs) => [
      ...crumbs,
      { label: folder.name, partitionId: this.currentPartitionId(), folderId: folder.id },
    ]);
    this.storageService.getEntryChildren(folder.id).subscribe({
      next: (entries) => {
        this.folders.set(entries.filter((e) => e.type === 'folder' && e.canWrite));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected goToCrumb(index: number): void {
    const crumb = this.crumbs()[index];
    this.crumbs.update((crumbs) => crumbs.slice(0, index + 1));
    this.currentPartitionId.set(crumb.partitionId);
    this.currentFolderId.set(crumb.folderId);
    this.loading.set(true);
    if (crumb.partitionId === null) {
      this.loadRoot();
      return;
    }
    const source$ = crumb.folderId
      ? this.storageService.getEntryChildren(crumb.folderId)
      : this.storageService.getPartitionEntries(crumb.partitionId);
    source$.subscribe({
      next: (entries) => {
        this.partitions.set([]);
        this.folders.set(entries.filter((e) => e.type === 'folder' && e.canWrite));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }

  protected selectHere(): void {
    const partitionId = this.currentPartitionId();
    if (!partitionId) {
      return;
    }
    const result: FolderPickerResult = { partitionId, folderId: this.currentFolderId() };
    this.dialogRef.close(result);
  }
}