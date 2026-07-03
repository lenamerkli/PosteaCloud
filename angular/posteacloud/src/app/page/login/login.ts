import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

import { AccountService } from '../../service/account.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.sass',
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly hidePassword = signal(true);

  protected readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    totp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  get email() {
    return this.loginForm.controls.email;
  }

  get password() {
    return this.loginForm.controls.password;
  }

  get totp() {
    return this.loginForm.controls.totp;
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update((hidden) => !hidden);
  }

  protected onSubmit(): void {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    const { email, password, totp } = this.loginForm.getRawValue();
    this.accountService.login(email, password, totp).subscribe({
      next: () => {
        this.accountService.update().subscribe({
          next: () => {
            this.submitting.set(false);
            void this.router.navigate(['/']);
          },
          error: () => {
            this.submitting.set(false);
          },
        });
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const message =
          (error as { error?: { message?: string } })?.error?.message ??
          'Invalid email, password, or TOTP code.';
        this.errorMessage.set(message);
      },
    });
  }
}