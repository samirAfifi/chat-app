import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  user,
} from '@angular/fire/auth';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { compressImage } from '../../shared/image-compress';

/** Arabic message for a Firebase Auth error; falls back to showing the raw code. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'الإيميل أو الباسورد غلط';
    case 'auth/email-already-in-use':
      return 'الإيميل ده مستخدم قبل كده';
    case 'auth/weak-password':
      return 'الباسورد ضعيف، لازم 6 حروف على الأقل';
    case 'auth/operation-not-allowed':
      return 'طريقة الدخول دي مش مفعّلة في Firebase Console (Authentication → Sign-in method)';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'اتقفلت نافذة Google قبل ما تكمل';
    case 'auth/popup-blocked':
      return 'المتصفح منع نافذة Google، اسمح بالـ popups وجرّب تاني';
    case 'auth/unauthorized-domain':
      return 'الدومين ده مش مضاف في Firebase (Authentication → Settings → Authorized domains)';
    case 'auth/network-request-failed':
      return 'مشكلة في الاتصال بالإنترنت';
    case 'auth/too-many-requests':
      return 'محاولات كتير، استنى شوية وجرّب تاني';
    default:
      return `حصل خطأ، جرّب تاني${code ? ` (${code})` : ''}`;
  }
}

/** Rejects with code 'timeout' if the promise doesn't settle in time. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(Object.assign(new Error('Timed out'), { code: 'timeout' })),
      ms
    );
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  user$ = user(this.auth);

  async register(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    this.background(this.saveUser(cred.user, name));
  }

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    this.background(this.setOnline(cred.user.uid, true));
  }

  async loginWithGoogle() {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    this.background(this.saveUser(cred.user));
  }

  async logout() {
    const current = this.auth.currentUser;
    // Must run before signOut (rules need an authenticated user), but never block logout on it.
    if (current) {
      await Promise.race([
        this.setOnline(current.uid, false).catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    }
    await signOut(this.auth);
  }

  /**
   * Makes sure users/{uid} exists and is complete, so the user shows up in other
   * people's contact lists. Covers sessions restored without login and old accounts
   * whose profile write was lost. Resolves once the server accepts the write.
   */
  ensureProfile() {
    const u = this.requireUser();
    return setDoc(
      doc(this.firestore, 'users', u.uid),
      {
        uid: u.uid,
        email: u.email,
        isOnline: true,
        // Only fill name/photo from Auth when present, so a name edited in the
        // profile page is never overwritten with an empty value.
        ...(u.displayName ? { displayName: u.displayName } : {}),
        ...(u.photoURL ? { photoURL: u.photoURL } : {}),
      },
      { merge: true }
    );
  }

  /** Best-effort presence update for the signed-in user (page load, tab close). */
  setPresence(isOnline: boolean) {
    const current = this.auth.currentUser;
    if (current) this.background(this.setOnline(current.uid, isOnline));
  }

  async updateDisplayName(displayName: string) {
    const current = this.requireUser();
    await updateProfile(current, { displayName });
    // Firestore applies this locally right away; don't block the UI on the server ack.
    this.background(
      setDoc(doc(this.firestore, 'users', current.uid), { displayName }, { merge: true })
    );
  }

  /**
   * Saves a new avatar without Firebase Storage: the picture is shrunk to 256px and
   * stored as a data URL in users/{uid}.avatar (Auth's photoURL can't hold one, and a
   * separate field means Google sign-in never overwrites the custom picture).
   */
  async updateAvatar(file: File): Promise<string> {
    const current = this.requireUser();
    const { dataUrl } = await compressImage(file, 256, 80 * 1024);
    await withTimeout(
      setDoc(doc(this.firestore, 'users', current.uid), { avatar: dataUrl }, { merge: true }),
      20_000
    );
    return dataUrl;
  }

  /** Live users/{uid} profile document (null if it doesn't exist yet). */
  profile$(uid: string) {
    return docData(doc(this.firestore, 'users', uid)) as Observable<
      { displayName?: string; email?: string; photoURL?: string | null; avatar?: string } | undefined
    >;
  }

  private requireUser() {
    const current = this.auth.currentUser;
    if (!current) throw Object.assign(new Error('Not signed in'), { code: 'auth/no-current-user' });
    return current;
  }

  /**
   * Firestore writes resolve only once the server acknowledges them, so awaiting them
   * would freeze login/register if Firestore is unreachable. Run them in the background.
   */
  private background(p: Promise<unknown>) {
    p.catch((e) => console.error('[AuthService] Firestore profile write failed', e));
  }

  private setOnline(uid: string, isOnline: boolean) {
    return setDoc(doc(this.firestore, 'users', uid), { isOnline }, { merge: true });
  }

  private saveUser(u: User, name?: string) {
    return setDoc(
      doc(this.firestore, 'users', u.uid),
      {
        uid: u.uid,
        displayName: name ?? u.displayName ?? 'User',
        email: u.email,
        photoURL: u.photoURL,
        isOnline: true,
      },
      { merge: true }
    );
  }
}
