import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, catchError, of, switchMap } from 'rxjs';
import { AuthService } from '../../../Authentication/services/auth';
import { ChatMeta, ChatService, ChatUser, chatIdFor } from '../../services/chat';

interface Contact extends ChatUser {
  chat?: ChatMeta;
}

@Component({
  selector: 'app-chat',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  private auth = inject(AuthService);
  private chatService = inject(ChatService);
  private router = inject(Router);

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** Last Firestore error, shown as a banner instead of breaking the page. */
  loadError = signal('');

  private authUser = toSignal(this.auth.user$, { initialValue: null });

  /** Turn a stream error into a banner + fallback value, so one failure can't freeze the view. */
  private safe<T>(source: Observable<T>, fallback: T, what: string): Observable<T> {
    return source.pipe(
      catchError((e) => {
        console.error(`[Chat] failed to load ${what}`, e);
        const code = (e as { code?: string })?.code;
        this.loadError.set(
          code === 'permission-denied'
            ? 'Firestore رفض الطلب (permission-denied) — راجع الـ Security Rules'
            : `تعذّر تحميل ${what}${code ? ` (${code})` : ''}`
        );
        return of(fallback);
      })
    );
  }

  private users = toSignal(
    toObservable(this.authUser).pipe(
      switchMap((u) => (u ? this.safe(this.chatService.users$(), [], 'المستخدمين') : of([])))
    ),
    { initialValue: [] }
  );

  private chats = toSignal(
    toObservable(this.authUser).pipe(
      switchMap((u) =>
        u ? this.safe(this.chatService.myChats$(u.uid), [], 'المحادثات') : of([])
      )
    ),
    { initialValue: [] }
  );

  /**
   * Current user for display. Prefers the Firestore profile: right after sign-up the
   * auth user's displayName is still empty because updateProfile doesn't re-emit.
   */
  me = computed(() => {
    const u = this.authUser();
    if (!u) return null;
    const profile = this.users().find((p) => p.uid === u.uid);
    return {
      uid: u.uid,
      displayName: profile?.displayName || u.displayName || u.email?.split('@')[0] || 'Me',
      email: u.email ?? profile?.email ?? '',
      photoURL: profile?.photoURL || u.photoURL,
    };
  });

  search = signal('');
  selectedUid = signal<string | null>(null);
  draft = signal('');
  sending = signal(false);

  /** Everyone except me, with their chat (if any), most recent conversation first. */
  contacts = computed<Contact[]>(() => {
    const myUid = this.me()?.uid;
    if (!myUid) return [];

    const byOther = new Map<string, ChatMeta>();
    for (const c of this.chats()) {
      const other = c.members.find((m) => m !== myUid);
      if (other) byOther.set(other, c);
    }

    const term = this.search().trim().toLowerCase();
    return this.users()
      .filter((u) => u.uid !== myUid)
      .filter(
        (u) =>
          !term ||
          u.displayName?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term)
      )
      .map((u) => ({ ...u, chat: byOther.get(u.uid) }))
      .sort((a, b) => {
        const ta = a.chat?.updatedAt?.toMillis() ?? 0;
        const tb = b.chat?.updatedAt?.toMillis() ?? 0;
        return tb - ta || (a.displayName ?? '').localeCompare(b.displayName ?? '');
      });
  });

  selected = computed(() => this.users().find((u) => u.uid === this.selectedUid()) ?? null);

  private activeChatId = computed(() => {
    const me = this.me();
    const other = this.selectedUid();
    return me && other ? chatIdFor(me.uid, other) : null;
  });

  messages = toSignal(
    toObservable(this.activeChatId).pipe(
      switchMap((id) => (id ? this.safe(this.chatService.messages$(id), [], 'الرسائل') : of([])))
    ),
    { initialValue: [] }
  );

  constructor() {
    // Keep the conversation scrolled to the newest message.
    afterRenderEffect(() => {
      this.messages();
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  open(uid: string) {
    this.selectedUid.set(uid);
    this.draft.set('');
  }

  back() {
    this.selectedUid.set(null);
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  async send() {
    const me = this.me();
    const other = this.selectedUid();
    const text = this.draft().trim();
    if (!me || !other || !text || this.sending()) return;

    this.sending.set(true);
    this.draft.set('');
    try {
      await this.chatService.send(me.uid, other, text);
    } catch (e) {
      console.error('[Chat] send failed', e);
      const code = (e as { code?: string })?.code;
      this.loadError.set(`الرسالة ما اتبعتتش${code ? ` (${code})` : ''}`);
      this.draft.set(text); // give the text back so it isn't lost
    } finally {
      this.sending.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  initials(name?: string | null) {
    return (name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }
}
