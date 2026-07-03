import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';

import { ConfirmDialog, ConfirmDialogData } from '../../../component/confirm-dialog/confirm-dialog';
import { AdminService } from '../../../service/admin.service';
import { IpScore } from '../../../type/ip-score';

@Component({
  selector: 'app-admin-ips',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './admin-ips.html',
  styleUrl: './admin-ips.sass',
})
export class AdminIps {
  private readonly adminService = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly displayedColumns = ['ip', 'score', 'description', 'actions'];
  protected readonly ips = signal<IpScore[]>([]);
  protected readonly loading = signal(true);
  protected readonly showCreateForm = signal(false);

  protected readonly createForm = this.formBuilder.nonNullable.group({
    ip: ['', Validators.required],
    score: [0, Validators.required],
    description: [''],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.adminService.getIps().subscribe({
      next: (ips) => {
        this.ips.set(ips);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected toggleCreateForm(): void {
    this.showCreateForm.update((value) => !value);
  }

  protected submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const { ip, score, description } = this.createForm.getRawValue();
    this.adminService.createIp(ip, score, description).subscribe(() => {
      this.createForm.reset({ ip: '', score: 0, description: '' });
      this.showCreateForm.set(false);
      this.load();
    });
  }

  protected updateScore(entry: IpScore, score: string): void {
    const parsed = Number(score);
    if (Number.isNaN(parsed)) {
      return;
    }
    this.adminService.updateIp(entry.ip, { score: parsed }).subscribe(() => this.load());
  }

  protected deleteIp(entry: IpScore): void {
    const data: ConfirmDialogData = {
      title: 'Delete IP entry',
      message: `Delete score entry for "${entry.ip}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    };
    this.dialog
      .open(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (confirmed) {
          this.adminService.deleteIp(entry.ip).subscribe(() => this.load());
        }
      });
  }
}