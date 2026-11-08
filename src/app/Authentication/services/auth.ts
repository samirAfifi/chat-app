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
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

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
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    }
    await signOut(this.auth);
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
