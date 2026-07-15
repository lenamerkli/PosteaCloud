import { DatePipe } from '@angular/common';
import { DestroyRef, Component, computed, inject, signal, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialog, ConfirmDialogData } from '../../component/confirm-dialog/confirm-dialog';
import {
  FolderPickerDialog,
  FolderPickerDialogData,
  FolderPickerResult,
} from '../../component/folder-picker-dialog/folder-picker-dialog';
import { NamePromptDialog, NamePromptDialogData } from '../../component/name-prompt-dialog/name-prompt-dialog';
import { ShareDialog, ShareDialogData } from '../../component/share-dialog/share-dialog';
import { BrowserRow, entryToRow, partitionToRow } from '../../other/browser-row';
import { formatBytes } from '../../other/format-bytes';
import { PathItem, StorageService, UploadProgress } from '../../service/storage.service';
import { Subscription } from 'rxjs';
import { Entry } from '../../type/entry';
import { Partition } from '../../type/partition';

type Mode = 'root' | 'partition' | 'folder' | 'trash' | 'shared' | 'recent';

interface Crumb {
  label: string;
  link: string[] | null;
}

const SECTION_TITLES: Record<Mode, string> = {
  root: 'Home',
  partition: '',
  folder: '',
  trash: 'Trash',
  shared: 'Shared with me',
  recent: 'Recent',
};

@Component({
  selector: 'app-file-browser',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTableModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './file-browser.html',
  styleUrl: './file-browser.sass',
})
export class FileBrowser {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storageService = inject(StorageService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly displayedColumns = ['name', 'size', 'edited', 'actions'];

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly rows = signal<BrowserRow[]>([]);
  protected readonly breadcrumbs = signal<Crumb[]>([]);
  protected readonly searchValue = signal('');
  protected readonly isSearching = signal(false);

  // Upload state
  protected readonly isUploading = signal(false);
  protected readonly uploadProgress = signal(0);    // 0–100
  protected readonly uploadTotal = signal(0);       // total file count
  protected readonly uploadDone = signal(0);        // files completed
  protected readonly uploadBytesDone = signal(0);   // bytes uploaded
  protected readonly uploadBytesTotal = signal(0);  // total bytes
  protected readonly uploadSpeed = signal('');      // e.g. "2.3 MB/s"
  protected readonly uploadErrors = signal<string[]>([]);

  private readonly mode = signal<Mode>('root');
  private readonly currentPartition = signal<Partition | null>(null);
  private readonly currentFolder = signal<Entry | null>(null);

  protected readonly pageTitle = computed(() => {
    const mode = this.mode();
    if (mode === 'partition') {
      return this.currentPartition()?.name ?? '';
    }
    if (mode === 'folder') {
      return this.currentFolder()?.name ?? '';
    }
    return SECTION_TITLES[mode];
  });

  protected readonly canWriteHere = computed(() => {
    const mode = this.mode();
    if (mode === 'partition') {
      return this.currentPartition()?.canWrite ?? false;
    }
    if (mode === 'folder') {
      return this.currentFolder()?.canWrite ?? false;
    }
    return false;
  });

  private readonly searchInput$ = new Subject<string>();

  constructor() {
    combineLatest([this.route.data, this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([data, params, queryParams]) => {
        const mode = data['mode'] as Mode;
        const id = params.get('id');
        const query = queryParams.get('q') ?? '';
        this.mode.set(mode);
        this.searchValue.set(query);
        this.load(mode, id, query);
      });

    this.searchInput$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { q: value.trim() || null },
        queryParamsHandling: 'merge',
      });
    });

    // Cancel any in-flight upload when the component is destroyed.
    this.destroyRef.onDestroy(() => {
      this.uploadSub?.unsubscribe();
    });
  }

  protected onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchInput$.next(value);
  }

  private load(mode: Mode, id: string | null, query: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.isSearching.set(query.trim().length > 0);

    switch (mode) {
      case 'root':
        this.loadRoot(query);
        break;
      case 'partition':
        this.loadPartition(id!, query);
        break;
      case 'folder':
        this.loadFolder(id!, query);
        break;
      case 'trash':
        this.loadTrash();
        break;
      case 'shared':
        this.loadShared();
        break;
      case 'recent':
        this.loadRecent();
        break;
    }
  }

  private loadRoot(query: string): void {
    this.breadcrumbs.set([{ label: 'Home', link: null }]);
    this.currentPartition.set(null);
    this.currentFolder.set(null);

    if (query.trim()) {
      this.storageService.search(query.trim()).subscribe({
        next: (entries) => this.finishLoad(entries.map(entryToRow)),
        error: (error) => this.finishError(error),
      });
      return;
    }

    this.storageService.getPartitions().subscribe({
      next: (partitions) =>
        this.finishLoad(
          partitions
            .filter((p) => !p.deleted)
            .map(partitionToRow)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      error: (error) => this.finishError(error),
    });
  }

  private loadPartition(partitionId: string, query: string): void {
    this.storageService.getPartition(partitionId).subscribe({
      next: (partition) => {
        this.currentPartition.set(partition);
        this.currentFolder.set(null);
        this.breadcrumbs.set([
          { label: 'Home', link: ['/'] },
          { label: partition.name, link: null },
        ]);

        if (query.trim()) {
          this.storageService.search(query.trim(), partitionId).subscribe({
            next: (entries) => this.finishLoad(entries.map(entryToRow)),
            error: (error) => this.finishError(error),
          });
          return;
        }

        this.storageService.getPartitionEntries(partitionId).subscribe({
          next: (entries) => this.finishLoad(entries.map(entryToRow)),
          error: (error) => this.finishError(error),
        });
      },
      error: (error) => this.finishError(error),
    });
  }

  private loadFolder(folderId: string, query: string): void {
    this.storageService.getEntry(folderId).subscribe({
      next: (folder) => {
        this.currentFolder.set(folder);
        this.currentPartition.set(null);
        this.storageService.getEntryPath(folderId).subscribe({
          next: (path) => this.breadcrumbs.set(this.buildFolderBreadcrumbs(path)),
        });

        if (query.trim()) {
          this.storageService.search(query.trim(), folder.partitionId).subscribe({
            next: (entries) => this.finishLoad(entries.map(entryToRow)),
            error: (error) => this.finishError(error),
          });
          return;
        }

        this.storageService.getEntryChildren(folderId).subscribe({
          next: (entries) => this.finishLoad(entries.map(entryToRow)),
          error: (error) => this.finishError(error),
        });
      },
      error: (error) => this.finishError(error),
    });
  }

  private buildFolderBreadcrumbs(path: PathItem[]): Crumb[] {
    const crumbs: Crumb[] = [{ label: 'Home', link: ['/'] }];
    path.forEach((item, index) => {
      const isLast = index === path.length - 1;
      if (item.isPartition && item.partition) {
        crumbs.push({
          label: item.partition.name,
          link: isLast ? null : ['/partition', item.partition.id],
        });
      } else if (item.entry) {
        crumbs.push({
          label: item.entry.name,
          link: isLast ? null : ['/folder', item.entry.id],
        });
      }
    });
    return crumbs;
  }

  private loadTrash(): void {
    this.currentPartition.set(null);
    this.currentFolder.set(null);
    this.breadcrumbs.set([
      { label: 'Home', link: ['/'] },
      { label: 'Trash', link: null },
    ]);
    this.storageService.getTrash().subscribe({
      next: (entries) => this.finishLoad(entries.map(entryToRow)),
      error: (error) => this.finishError(error),
    });
  }

  private loadShared(): void {
    this.currentPartition.set(null);
    this.currentFolder.set(null);
    this.breadcrumbs.set([
      { label: 'Home', link: ['/'] },
      { label: 'Shared with me', link: null },
    ]);
    this.storageService.getShared().subscribe({
      next: ({ partitions, entries }) =>
        this.finishLoad([...partitions.map(partitionToRow), ...entries.map(entryToRow)]),
      error: (error) => this.finishError(error),
    });
  }

  private loadRecent(): void {
    this.currentPartition.set(null);
    this.currentFolder.set(null);
    this.breadcrumbs.set([
      { label: 'Home', link: ['/'] },
      { label: 'Recent', link: null },
    ]);
    this.storageService.getRecent().subscribe({
      next: (entries) => this.finishLoad(entries.map(entryToRow)),
      error: (error) => this.finishError(error),
    });
  }

  private finishLoad(rows: BrowserRow[]): void {
    this.rows.set(rows);
    this.loading.set(false);
  }

  private finishError(error: unknown): void {
    const message =
      (error as { error?: { message?: string } })?.error?.message ?? 'Failed to load data.';
    this.errorMessage.set(message);
    this.rows.set([]);
    this.loading.set(false);
  }

  protected reload(): void {
    this.load(this.mode(), this.route.snapshot.paramMap.get('id'), this.searchValue());
  }

  protected iconFor(row: BrowserRow): string {
    switch (row.rowType) {
      case 'partition':
      case 'folder':
        return 'folder';
      case 'link':
        return 'link';
      default:
        return 'insert_drive_file';
    }
  }

  protected formatSize(row: BrowserRow): string {
    return row.size != null ? formatBytes(row.size) : '—';
  }

  /** Expose the byte formatter so the template can use it directly. */
  protected formatBytes(n: number): string {
    return formatBytes(n);
  }

  protected openRow(row: BrowserRow): void {
    if (row.rowType === 'partition') {
      void this.router.navigate(['/partition', row.id]);
      return;
    }
    if (row.rowType === 'folder') {
      void this.router.navigate(['/folder', row.id]);
      return;
    }
    if (row.rowType === 'link' && row.entry) {
      this.followLink(row.entry);
      return;
    }
    if (row.rowType === 'file' && row.entry) {
      this.downloadEntry(row.entry);
    }
  }

  private followLink(entry: Entry): void {
    if (entry.targetPartitionId) {
      void this.router.navigate(['/partition', entry.targetPartitionId]);
      return;
    }
    if (entry.targetId) {
      this.storageService.getEntry(entry.targetId).subscribe({
        next: (target) => {
          if (target.type === 'folder') {
            void this.router.navigate(['/folder', target.id]);
          } else {
            this.downloadEntry(target);
          }
        },
      });
    }
  }

  protected downloadEntry(entry: Entry): void {
    this.storageService.downloadEntry(entry.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = entry.name;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  protected canRename(row: BrowserRow): boolean {
    return row.rowType !== 'partition' && row.canWrite;
  }

  protected canMove(row: BrowserRow): boolean {
    return row.rowType !== 'partition' && row.canWrite;
  }

  protected canShare(row: BrowserRow): boolean {
    return row.owned;
  }

  protected canDelete(row: BrowserRow): boolean {
    return row.rowType === 'partition' ? row.owned : row.canWrite;
  }

  protected canRestore(row: BrowserRow): boolean {
    return this.mode() === 'trash' && row.owned;
  }

  protected renameRow(row: BrowserRow): void {
    if (!row.entry) {
      return;
    }
    const data: NamePromptDialogData = {
      title: 'Rename',
      label: 'New name',
      initialValue: row.name,
      confirmLabel: 'Rename',
    };
    this.dialog
      .open(NamePromptDialog, { data })
      .afterClosed()
      .subscribe((newName: string | null) => {
        if (newName && row.entry) {
          this.storageService.renameEntry(row.entry.id, newName).subscribe(() => this.reload());
        }
      });
  }

  protected moveRow(row: BrowserRow): void {
    if (!row.entry) {
      return;
    }
    const data: FolderPickerDialogData = { title: `Move "${row.name}"` };
    this.dialog
      .open(FolderPickerDialog, { data })
      .afterClosed()
      .subscribe((result: FolderPickerResult | null) => {
        if (result && row.entry) {
          this.storageService.moveEntry(row.entry.id, result.folderId).subscribe({
            next: () => this.reload(),
            error: (error) => this.finishError(error),
          });
        }
      });
  }

  protected shareRow(row: BrowserRow): void {
    const data: ShareDialogData = {
      targetType: row.rowType === 'partition' ? 'partition' : 'entry',
      targetId: row.id,
      targetName: row.name,
    };
    this.dialog.open(ShareDialog, { data, width: '420px' });
  }

  protected deleteRow(row: BrowserRow): void {
    const data: ConfirmDialogData = {
      title: row.rowType === 'partition' ? 'Delete partition' : 'Delete',
      message: `Move "${row.name}" to trash?`,
      confirmLabel: 'Move to trash',
      destructive: true,
    };
    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (!confirmed) {
          return;
        }
        const request$ =
          row.rowType === 'partition'
            ? this.storageService.deletePartition(row.id)
            : this.storageService.deleteEntry(row.id);
        request$.subscribe({
          next: () => this.reload(),
          error: (error) => this.finishError(error),
        });
      });
  }

  protected restoreRow(row: BrowserRow): void {
    if (!row.entry) {
      return;
    }
    this.storageService.restoreEntry(row.entry.id).subscribe({
      next: () => this.reload(),
      error: (error) => this.finishError(error),
    });
  }

  protected createFolder(): void {
    const data: NamePromptDialogData = {
      title: 'New folder',
      label: 'Folder name',
      confirmLabel: 'Create',
    };
    this.dialog
      .open(NamePromptDialog, { data })
      .afterClosed()
      .subscribe((name: string | null) => {
        if (name) {
          const { partitionId, parentId } = this.writeTargetContext();
          if (!partitionId) {
            return;
          }
          this.storageService.createFolder(name, partitionId, parentId).subscribe({
            next: () => this.reload(),
            error: (error) => this.finishError(error),
          });
        }
      });
  }

  protected createLink(): void {
    const data: FolderPickerDialogData = { title: 'Select link target' };
    this.dialog
      .open(FolderPickerDialog, { data })
      .afterClosed()
      .subscribe((result: FolderPickerResult | null) => {
        if (!result) {
          return;
        }
        const nameData: NamePromptDialogData = {
          title: 'New link',
          label: 'Link name',
          confirmLabel: 'Create',
        };
        this.dialog
          .open(NamePromptDialog, { data: nameData })
          .afterClosed()
          .subscribe((name: string | null) => {
            if (!name) {
              return;
            }
            const { partitionId, parentId } = this.writeTargetContext();
            if (!partitionId) {
              return;
            }
            this.storageService
              .createLink(
                name,
                partitionId,
                parentId,
                result.folderId,
                result.folderId ? null : result.partitionId,
              )
              .subscribe({
                next: () => this.reload(),
                error: (error) => this.finishError(error),
              });
          });
      });
  }

  /**
   * Accept a FileList (from a standard <input type="file">) and upload every
   * file individually — no directory structure.
   */
  protected uploadFiles(fileList: FileList | null): void {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) {
      return;
    }
    const target = this.currentFolder()?.id ?? this.currentPartition()?.id;
    if (!target) {
      return;
    }
    this._runBatchUpload(target, files, files.map(() => ''));
  }

  /**
   * Accept a FileList from a directory-picker (<input webkitdirectory>) and
   * upload everything while preserving the relative folder structure.
   */
  protected uploadDirectory(fileList: FileList | null): void {
    const raw = fileList ? Array.from(fileList) : [];
    if (raw.length === 0) {
      return;
    }
    const target = this.currentFolder()?.id ?? this.currentPartition()?.id;
    if (!target) {
      return;
    }

    // Build relative paths using the webkitRelativePath property.
    const files: File[] = [];
    const relativePaths: string[] = [];

    for (const file of raw) {
      // webkitRelativePath is set by the browser when webkitdirectory is used.
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
      files.push(file);
      relativePaths.push(rel);
    }

    this._runBatchUpload(target, files, relativePaths);
  }

  private uploadSub: Subscription | null = null;

  private _runBatchUpload(target: string, files: File[], relativePaths: string[]): void {
    // Cancel any running upload.
    this.uploadSub?.unsubscribe();

    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.uploadTotal.set(files.length);
    this.uploadDone.set(0);
    this.uploadBytesDone.set(0);
    this.uploadBytesTotal.set(files.reduce((a, f) => a + f.size, 0));
    this.uploadSpeed.set('');
    this.uploadErrors.set([]);
    this.errorMessage.set('');

    const { progress$, response$ } = this.storageService.uploadBatchWithProgress(
      target,
      files,
      relativePaths,
    );

    this.uploadSub = new Subscription();

    // Also track the underlying HTTP/XHR subscription so that
    // unsubscribing actually aborts the in-flight request(s).
    const httpSub = (response$ as { _sub?: Subscription })._sub;
    if (httpSub) {
      this.uploadSub.add(httpSub);
    }

    this.uploadSub.add(
      progress$.subscribe((p: UploadProgress) => {
        this.uploadProgress.set(p.percent);
        this.uploadDone.set(p.filesDone);
        this.uploadBytesDone.set(p.bytesUploaded);
        this.uploadSpeed.set(p.speed);
      }),
    );

    this.uploadSub.add(
      response$.subscribe((response) => {
        const done = response.entries.length;
        const total = files.length;

        const errors: string[] = [];
        if (response.upload_errors) {
          for (const e of response.upload_errors) {
            errors.push(`${e.file}: ${e.error}`);
          }
        }
        this.uploadErrors.set(errors);

        if (errors.length > 0) {
          this.errorMessage.set(
            `${done} file(s) uploaded, ${errors.length} error(s).`,
          );
        }

        this.isUploading.set(false);
        this.reload();
      }),
    );
  }

  private writeTargetContext(): { partitionId: string | null; parentId: string | null } {
    const folder = this.currentFolder();
    if (folder) {
      return { partitionId: folder.partitionId, parentId: folder.id };
    }
    const partition = this.currentPartition();
    if (partition) {
      return { partitionId: partition.id, parentId: null };
    }
    return { partitionId: null, parentId: null };
  }
}