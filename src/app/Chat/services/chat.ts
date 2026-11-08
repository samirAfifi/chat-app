import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  doc,
  limitToLast,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface ChatUser {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  isOnline: boolean;
}

export interface ChatMeta {
  id: string;
  members: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt?: Timestamp | null;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  /** null while the server timestamp is still pending */
  createdAt: Timestamp | null;
}

/** One-to-one chat id: both uids sorted, so A→B and B→A share the same chat. */
export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private firestore = inject(Firestore);

  users$(): Observable<ChatUser[]> {
    return collectionData(collection(this.firestore, 'users'), {
      idField: 'uid',
    }) as Observable<ChatUser[]>;
  }

  /** Chats the user belongs to. Sorted on the client to avoid needing a composite index. */
  myChats$(uid: string): Observable<ChatMeta[]> {
    const q = query(collection(this.firestore, 'chats'), where('members', 'array-contains', uid));
    return collectionData(q, { idField: 'id' }) as Observable<ChatMeta[]>;
  }

  messages$(chatId: string, max = 200): Observable<Message[]> {
    const q = query(
      collection(this.firestore, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(max)
    );
    return collectionData(q, { idField: 'id' }) as Observable<Message[]>;
  }

  async send(senderId: string, receiverId: string, text: string) {
    const body = text.trim();
    if (!body) return;

    const chatRef = doc(this.firestore, 'chats', chatIdFor(senderId, receiverId));
    await setDoc(
      chatRef,
      {
        members: [senderId, receiverId],
        lastMessage: body,
        lastSenderId: senderId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await addDoc(collection(chatRef, 'messages'), {
      senderId,
      text: body,
      createdAt: serverTimestamp(),
    });
  }
}
