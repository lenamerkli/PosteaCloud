import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';

import { AccountService } from '../../service/account.service';
import { StorageService } from '../../service/storage.service';
import { UserSearchResult } from '../../type/account';
import { Share } from '../../type/share';

export interface ShareDialogData {
  targetType: 'partition' | 'entry';
  targetId: string;
  targetName: string;
}

@Component({
  selector: 'app-share-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './share-dialog.html',
  styleUrl: './share-dialog.sass',
})
export class ShareDialog {
  private readonly storageService = inject(StorageService);
  private readonly accountService = inject(AccountService);
  protected readonly dialogRef = inject(MatDialogRef<ShareDialog>);
  protected readonly data = inject<ShareDialogData>(MAT_DIALOG_DATA);

  protected readonly loading = signal(true);
  protected readonly shares = signal<Share[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly searchResults = signal<UserSearchResult[]>([]);
  protected readonly newShareAllowWrite = signal(false);
  protected readonly errorMessage = signal('');

  private readonly search$ = new Subject<string>();

  constructor() {
    this.loadShares();
    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) =>
          term.trim().length >= 2 ? this.accountService.searchUsers(term.trim()) : [],
        ),
      )
      .subscribe({
        next: (results) => this.searchResults.set(results),
        error: () => this.searchResults.set([]),
      });
  }

  private loadShares(): void {
    this.loading.set(true);
    const source$ =
      this.data.targetType === 'partition'
        ? this.storageService.getPartitionShares(this.data.targetId)
        : this.storageService.getEntryShares(this.data.targetId);
    source$.subscribe({
      next: (shares) => {
        this.shares.set(shares);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.search$.next(value);
  }

  protected addShare(user: UserSearchResult): void {
    this.errorMessage.set('');
    const source$ =
      this.data.targetType === 'partition'
        ? this.storageService.sharePartition(
            this.data.targetId,
            user.userId,
            this.newShareAllowWrite(),
          )
        : this.storageService.shareEntry(
            this.data.targetId,
            user.userId,
            this.newShareAllowWrite(),
          );
    source$.subscribe({
      next: () => {
        this.searchTerm.set('');
        this.searchResults.set([]);
        this.loadShares();
      },
      error: (error: unknown) => {
        const message =
          (error as { error?: { message?: string } })?.error?.message ?? 'Failed to share.';
        this.errorMessage.set(message);
      },
    });
  }

  protected toggleWrite(share: Share): void {
    const source$ =
      this.data.targetType === 'partition'
        ? this.storageService.sharePartition(this.data.targetId, share.userId, !share.allowWrite)
        : this.storageService.shareEntry(this.data.targetId, share.userId, !share.allowWrite);
    source$.subscribe({ next: () => this.loadShares() });
  }

  protected revoke(share: Share): void {
    const source$ =
      this.data.targetType === 'partition'
        ? this.storageService.revokePartitionShare(this.data.targetId, share.userId)
        : this.storageService.revokeEntryShare(this.data.targetId, share.userId);
    source$.subscribe({ next: () => this.loadShares() });
  }

  protected close(): void {
    this.dialogRef.close();
  }
}