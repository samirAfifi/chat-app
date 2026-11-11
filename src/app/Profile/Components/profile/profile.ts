import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, switchMap, tap } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../../Authentication/services/auth';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './profile.html',
})
export class Profile {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  photoURL = signal<string | null>(null);
  /** Local preview of a newly picked avatar, before it's saved. */
  preview = signal<string | null>(null);
  private avatarFile: File | null = null;

  saving = signal(false);
  error = signal('');
  saved = signal(false);

  form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(40)]],
  });

  constructor() {
    this.auth.user$
      .pipe(
        tap((u) => {
          if (!u) return;
          this.email.set(u.email ?? '');
          this.photoURL.set(u.photoURL);
          if (!this.form.dirty) this.form.patchValue({ displayName: u.displayName ?? '' });
        }),
        // The Firestore profile holds the custom avatar and the latest name.
        switchMap((u) => (u ? this.auth.profile$(u.uid) : of(undefined))),
        takeUntilDestroyed()
      )
      .subscribe((p) => {
        if (!p) return;
        const pic = p.avatar || p.photoURL;
        if (pic) this.photoURL.set(pic);
        if (p.displayName && !this.form.dirty) this.form.patchValue({ displayName: p.displayName });
      });

    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  onAvatarSelected(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('اختار صورة (JPG / PNG / WebP)');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.error.set('الصورة أكبر من 5 MB');
      return;
    }
    this.error.set('');
    this.saved.set(false);
    this.revokePreview();
    this.avatarFile = file;
    this.preview.set(URL.createObjectURL(file));
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);

    // Name and photo are saved separately so a Storage problem can't block the name.
    let nameSaved = !this.form.dirty;
    try {
      if (this.form.dirty) {
        await this.auth.updateDisplayName(this.form.getRawValue().displayName.trim());
        this.form.markAsPristine();
        nameSaved = true;
      }
      if (this.avatarFile) {
        this.photoURL.set(await this.auth.updateAvatar(this.avatarFile));
        this.avatarFile = null;
        this.revokePreview();
      }
      this.saved.set(true);
    } catch (e) {
      console.error('[Profile] save failed', e);
      this.error.set((nameSaved ? 'الاسم اتحفظ، بس ' : '') + this.describeError(e));
    } finally {
      this.saving.set(false);
    }
  }

  private describeError(e: unknown) {
    const code = (e as { code?: string })?.code ?? '';
    switch (code) {
      case 'timeout':
        return 'حفظ الصورة أخد وقت طويل، اتأكد من الإنترنت وجرّب تاني';
      case 'permission-denied':
        return 'Firestore رفض الحفظ (permission-denied) — راجع الـ Rules';
      case 'image/too-large':
        return 'الصورة كبيرة أوي حتى بعد الضغط، جرّب صورة تانية';
      case 'image/unsupported':
      case 'image/not-an-image':
        return 'تعذّر قراءة الصورة، جرّب JPG أو PNG';
      case 'auth/network-request-failed':
        return 'مشكلة في الاتصال بالإنترنت';
      default:
        return `تعذّر الحفظ${code ? ` (${code})` : ''}`;
    }
  }

  async logout() {
    try {
      await this.auth.logout();
    } finally {
      await this.router.navigate(['/login'], { replaceUrl: true });
    }
  }

  initials(name?: string | null) {
    return (name || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  private revokePreview() {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
  }
}
