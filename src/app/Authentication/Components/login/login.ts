import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService, authErrorMessage } from '../../services/auth';


@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // show the field errors instead of doing nothing
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      await this.router.navigate(['/chat']);
    } catch (e) {
      console.error('[Login] email login failed', e);
      this.error.set(authErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async google() {
    this.error.set('');
    try {
      await this.auth.loginWithGoogle();
      await this.router.navigate(['/chat']);
    } catch (e) {
      console.error('[Login] Google login failed', e);
      this.error.set(authErrorMessage(e));
    }
  }
}
