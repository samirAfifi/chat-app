import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  collectionData,
  deleteField,
  doc,
  updateDoc,
  increment,
  limitToLast,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytesResumable } from '@angular/fire/storage';
import { Observable, map } from 'rxjs';

export interface ChatUser {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  /** Custom profile picture as a data URL (set from the profile page). */
  avatar?: string;
  isOnline: boolean;
}

export interface ChatMeta {
  id: string;
  members: string[];
  lastMessage?: string;
  lastSenderId?: string;
  updatedAt?: Timestamp | null;
  /** Unread message count per member uid. */
  unread?: Record<string, number>;
  /** When each member last read the chat (drives the ✓✓ seen ticks). */
  lastRead?: Record<string, Timestamp | null>;
  /** When each member last typed; null when they stopped. */
  typing?: Record<string, Timestamp | null>;
}

export type MessageType = 'text' | 'image' | 'file';

export interface Message {
  id: string;
  senderId: string;
  /** Missing on messages sent before attachments existed: treat as 'text'. */
  type?: MessageType;
  text: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  /** Snapshot of the message this one replies to (kept even if the original changes). */
  replyTo?: ReplyRef;
  /** One reaction emoji per member uid. */
  reactions?: Record<string, string>;
  editedAt?: Timestamp | null;
  /** "Deleted for everyone": content is blanked, the bubble shows a placeholder. */
  deleted?: boolean;
  /** null while the server timestamp is still pending */
  createdAt: Timestamp | null;
}

export interface ReplyRef {
  id: string;
  senderId: string;
  type: MessageType;
  /** Short preview of the original text (or caption). */
  text: string;
}

/** One-line preview of a message for the contact list and reply quotes. */
export function messagePreview(m: Pick<Message, 'type' | 'text' | 'fileName' | 'deleted'>) {
  if (m.deleted) return '🚫 Message deleted';
  const text = (m.text ?? '').trim();
  if (m.type === 'image') return `📷 ${text || 'Photo'}`;
  if (m.type === 'file') return `📎 ${m.fileName ?? 'File'}`;
  return text;
}

const REPLY_SNIPPET_MAX = 120;

export interface Attachment {
  type: 'image' | 'file';
  fileUrl: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** One-to-one chat id: both uids sorted, so A→B and B→A share the same chat. */
export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

function membersOf(a: string, b: string) {
  return [a, b].sort();
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  users$(): Observable<ChatUser[]> {
    return (
      collectionData(collection(this.firestore, 'users'), {
        idField: 'uid',
      }) as Observable<ChatUser[]>
    ).pipe(
      // Older or partial profiles may lack a name: fall back to the email's local part.
      map((users) =>
        users.map((u) => ({
          ...u,
          displayName: u.displayName || u.email?.split('@')[0] || 'User',
          // A custom avatar (stored inline in Firestore) wins over the Google photo.
          photoURL: u.avatar || u.photoURL || null,
          isOnline: !!u.isOnline,
        }))
      )
    );
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

  /**
   * Sends a text and/or attachment. The message and the chat summary are written in one
   * batch so the contact list never shows a "last message" that doesn't exist.
   */
  async send(
    senderId: string,
    receiverId: string,
    text: string,
    attachment?: Attachment,
    replyTo?: Message | null
  ) {
    const body = text.trim();
    if (!body && !attachment) return;

    const chatRef = doc(this.firestore, 'chats', chatIdFor(senderId, receiverId));
    const msgRef = doc(collection(chatRef, 'messages'));

    const preview = messagePreview({
      type: attachment?.type ?? 'text',
      text: body,
      fileName: attachment?.fileName,
    });
    const reply: ReplyRef | null = replyTo
      ? {
          id: replyTo.id,
          senderId: replyTo.senderId,
          type: replyTo.type ?? 'text',
          text: messagePreview(replyTo).slice(0, REPLY_SNIPPET_MAX),
        }
      : null;

    const batch = writeBatch(this.firestore);
    batch.set(
      chatRef,
      {
        members: membersOf(senderId, receiverId),
        lastMessage: preview,
        lastSenderId: senderId,
        updatedAt: serverTimestamp(),
        unread: { [receiverId]: increment(1) },
        typing: { [senderId]: null },
      },
      { merge: true }
    );
    batch.set(msgRef, {
      senderId,
      type: attachment?.type ?? 'text',
      text: body,
      ...(attachment ?? {}),
      ...(reply ? { replyTo: reply } : {}),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Sets (or with null, removes) my reaction on a message. */
  react(chatId: string, messageId: string, uid: string, emoji: string | null) {
    return updateDoc(doc(this.firestore, 'chats', chatId, 'messages', messageId), {
      [`reactions.${uid}`]: emoji ?? deleteField(),
    });
  }

  /**
   * Edits my message's text. When it's the newest message in the chat, the contact
   * list preview is updated in the same batch.
   */
  async editMessage(uid: string, otherUid: string, m: Message, text: string, isLatest: boolean) {
    const chatId = chatIdFor(uid, otherUid);
    const body = text.trim();
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'chats', chatId, 'messages', m.id), {
      text: body,
      editedAt: serverTimestamp(),
    });
    if (isLatest) {
      batch.set(
        doc(this.firestore, 'chats', chatId),
        { members: membersOf(uid, otherUid), lastMessage: messagePreview({ ...m, text: body }) },
        { merge: true }
      );
    }
    await batch.commit();
  }

  /** "Delete for everyone": blanks the content but keeps the message slot in the thread. */
  async deleteMessage(uid: string, otherUid: string, m: Message, isLatest: boolean) {
    const chatId = chatIdFor(uid, otherUid);
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'chats', chatId, 'messages', m.id), {
      deleted: true,
      type: 'text',
      text: '',
      fileUrl: deleteField(),
      fileName: deleteField(),
      fileSize: deleteField(),
      contentType: deleteField(),
      replyTo: deleteField(),
    });
    if (isLatest) {
      batch.set(
        doc(this.firestore, 'chats', chatId),
        { members: membersOf(uid, otherUid), lastMessage: messagePreview({ ...m, deleted: true }) },
        { merge: true }
      );
    }
    await batch.commit();
  }

  /** Clears my unread counter and records when I read the chat (for the sender's ✓✓). */
  markRead(chatId: string, uid: string, otherUid: string) {
    return setDoc(
      doc(this.firestore, 'chats', chatId),
      {
        members: membersOf(uid, otherUid),
        unread: { [uid]: 0 },
        lastRead: { [uid]: serverTimestamp() },
      },
      { merge: true }
    );
  }

  setTyping(chatId: string, uid: string, otherUid: string, typing: boolean) {
    return setDoc(
      doc(this.firestore, 'chats', chatId),
      {
        members: membersOf(uid, otherUid),
        typing: { [uid]: typing ? serverTimestamp() : null },
      },
      { merge: true }
    );
  }

  /** Uploads a file to chats/{chatId}/ in Storage, reporting progress 0–100. */
  uploadAttachment(
    chatId: string,
    file: File,
    onProgress: (percent: number) => void
  ): Promise<Attachment> {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const fileRef = ref(this.storage, `chats/${chatId}/${Date.now()}_${safeName}`);
    const task = uploadBytesResumable(fileRef, file, { contentType: file.type });

    return new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (s) => onProgress(s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0),
        reject,
        async () => {
          try {
            resolve({
              type: file.type.startsWith('image/') ? 'image' : 'file',
              fileUrl: await getDownloadURL(task.snapshot.ref),
              fileName: file.name,
              fileSize: file.size,
              contentType: file.type || 'application/octet-stream',
            });
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }
}
