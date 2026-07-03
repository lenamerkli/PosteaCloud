import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';

@Component({
  selector: 'app-hash',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
  ],
  templateUrl: './hash.html',
  styleUrl: './hash.sass',
})
export class Hash {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly password = signal('');
  protected readonly hashing = signal(false);
  protected readonly generatingTotp = signal(false);

  protected readonly totpSecret = signal('');
  protected readonly hashedPassword = signal('');
  protected readonly salt = signal('');
  protected readonly qrDataUrl = signal('');
  protected readonly resultJson = signal('');

  private updateResultJson(): void {
    const result: Record<string, string> = {};
    if (this.hashedPassword()) {
      result['hashed_password'] = this.hashedPassword();
    }
    if (this.salt()) {
      result['salt'] = this.salt();
    }
    if (this.totpSecret()) {
      result['totp_secret'] = this.totpSecret();
    }
    if (Object.keys(result).length > 0) {
      this.resultJson.set(JSON.stringify(result, null, 2));
    }
  }

  protected async hashPassword(): Promise<void> {
    const pw = this.password().trim();
    if (!pw) {
      this.snackBar.open('Please enter a password to hash.', 'Close', { duration: 3000 });
      return;
    }
    this.hashing.set(true);
    try {
      const res = await this.http
        .post<{ success: string; salt: string; hash: string }>('/api/v1/hash_password', { password: pw })
        .toPromise();
      if (res) {
        this.salt.set(res.salt);
        this.hashedPassword.set(res.hash);
        this.updateResultJson();
        this.snackBar.open('Password hashed successfully!', 'Close', { duration: 3000 });
      }
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to hash password.';
      this.snackBar.open(msg, 'Close', { duration: 5000 });
    } finally {
      this.hashing.set(false);
    }
  }

  protected generateTotp(): void {
    this.generatingTotp.set(true);
    try {
      const secret = generateSecret();
      this.totpSecret.set(secret);
      const otpauthUrl = generateURI({
        issuer: 'PosteaCloud',
        label: 'user',
        secret,
      });
      QRCode.toDataURL(otpauthUrl, { width: 256 })
        .then((dataUrl: string) => {
          this.qrDataUrl.set(dataUrl);
        })
        .catch(() => {
          this.snackBar.open('Failed to generate QR code.', 'Close', { duration: 5000 });
        });
      this.updateResultJson();
      this.snackBar.open('TOTP secret generated successfully!', 'Close', { duration: 3000 });
    } catch {
      this.snackBar.open('Failed to generate TOTP secret.', 'Close', { duration: 5000 });
    } finally {
      this.generatingTotp.set(false);
    }
  }

  protected copyToClipboard(value: string, label: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.snackBar.open(`${label} copied to clipboard!`, 'Close', { duration: 2000 });
    }).catch(() => {
      this.snackBar.open('Failed to copy to clipboard.', 'Close', { duration: 3000 });
    });
  }
}