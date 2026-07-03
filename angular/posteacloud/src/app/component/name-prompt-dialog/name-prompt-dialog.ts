import { A11yModule } from '@angular/cdk/a11y';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface NamePromptDialogData {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
}

@Component({
  selector: 'app-name-prompt-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    A11yModule,
  ],
  templateUrl: './name-prompt-dialog.html',
  styleUrl: './name-prompt-dialog.sass',
})
export class NamePromptDialog {
  protected readonly dialogRef = inject(MatDialogRef<NamePromptDialog>);
  protected readonly data = inject<NamePromptDialogData>(MAT_DIALOG_DATA);

  protected readonly value = signal(this.data.initialValue ?? '');

  protected cancel(): void {
    this.dialogRef.close(null);
  }

  protected confirm(): void {
    const trimmed = this.value().trim();
    if (!trimmed) {
      return;
    }
    this.dialogRef.close(trimmed);
  }
}