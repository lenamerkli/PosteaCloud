import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { switchMap } from 'rxjs/operators';

import { ConfirmDialog, ConfirmDialogData } from '../../../component/confirm-dialog/confirm-dialog';
import { NamePromptDialog, NamePromptDialogData } from '../../../component/name-prompt-dialog/name-prompt-dialog';
import { AdminService } from '../../../service/admin.service';
import { Account } from '../../../type/account';

@Component({
  selector: 'app-admin-accounts',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './admin-accounts.html',
  styleUrl: './admin-accounts.sass',
})
export class AdminAccounts {
  private readonly adminService = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly displayedColumns = ['username', 'email', 'balance', 'actions'];
  protected readonly accounts = signal<Account[]>([]);
  protected readonly loading = signal(true);
  protected readonly showCreateForm = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly createForm = this.formBuilder.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    totp: ['', Validators.required],
    balance: [0],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.adminService.getAccounts().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected toggleCreateForm(): void {
    this.showCreateForm.update((value) => !value);
    this.errorMessage.set('');
  }

  protected submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.errorMessage.set('');
    const { username, email, password, totp, balance } = this.createForm.getRawValue();
    this.adminService
      .hashPassword(password)
      .pipe(
        switchMap(({ salt, hash }) =>
          this.adminService.createAccount({ username, email, salt, hash, totp, balance }),
        ),
      )
      .subscribe({
        next: () => {
          this.createForm.reset({ username: '', email: '', password: '', totp: '', balance: 0 });
          this.showCreateForm.set(false);
          this.load();
        },
        error: (error: unknown) => {
          const message =
            (error as { error?: { message?: string } })?.error?.message ??
            'Failed to create account.';
          this.errorMessage.set(message);
        },
      });
  }

  protected resetPassword(account: Account): void {
    const data: NamePromptDialogData = {
      title: `Reset password for ${account.username}`,
      label: 'New password',
      confirmLabel: 'Reset',
    };
    this.dialog
      .open(NamePromptDialog, { data })
      .afterClosed()
      .subscribe((password: string | null) => {
        if (!password) {
          return;
        }
        this.adminService
          .hashPassword(password)
          .pipe(
            switchMap(({ salt, hash }) => this.adminService.resetPassword(account.id, salt, hash)),
          )
          .subscribe();
      });
  }

  protected deleteAccount(account: Account): void {
    const data: ConfirmDialogData = {
      title: 'Delete account',
      message: `Delete account "${account.username}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    };
    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.adminService.deleteAccount(account.id).subscribe(() => this.load());
        }
      });
  }
}