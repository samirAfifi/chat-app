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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  user$ = user(this.auth);

  async register(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await this.saveUser(cred.user, name);
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async loginWithGoogle() {
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.saveUser(cred.user);
  }

  logout() {
    return signOut(this.auth);
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