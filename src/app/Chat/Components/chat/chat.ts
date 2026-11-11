import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Observable, catchError, of, switchMap } from 'rxjs';
import { EmojiPicker } from '../emoji-picker/emoji-picker';
import { compressImage } from '../../../shared/image-compress';
import { AuthService } from '../../../Authentication/services/auth';
import {
  ChatMeta,
  ChatService,
  ChatUser,
  MAX_ATTACHMENT_BYTES,
  Message,
  chatIdFor,
  messagePreview,
} from '../../services/chat';

/** Quick reactions offered on every message. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface Contact extends ChatUser {
  chat?: ChatMeta;
  unread: number;
  typing: boolean;
}

/** A typing timestamp older than this is treated as "stopped typing". */
const TYPING_TTL_MS = 6000;
/** Re-send "I'm typing" at most this often while the user keeps typing. */
const TYPING_REFRESH_MS = 3000;
/** Clear "I'm typing" after this long without a keystroke. */
const TYPING_IDLE_MS = 4000;

@Component({
  selector: 'app-chat',
  host: { '(document:keydown.escape)': 'onEscape()' },
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    EmojiPicker,
  ],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  private auth = inject(AuthService);
  private chatService = inject(ChatService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private composerInput = viewChild<ElementRef<HTMLTextAreaElement>>('composerInput');

  emojiOpen = signal(false);
  /** Photo shown full-size in the in-page viewer (data URLs can't open in a new tab). */
  viewer = signal<string | null>(null);

  readonly quickReactions = QUICK_REACTIONS;
  /** Message the composer is replying to. */
  replyingTo = signal<Message | null>(null);
  /** Message being edited (the composer holds its text). */
  editing = signal<Message | null>(null);
  /** Message briefly highlighted after jumping to it from a reply quote. */
  highlightId = signal<string | null>(null);
  /** Chat + newest message id we last auto-scrolled for. */
  private scrolledFor = '';

  /** Last Firestore error, shown as a banner instead of breaking the page. */
  loadError = signal('');

  private authUser = toSignal(this.auth.user$, { initialValue: null });

  /** Turn a stream error into a banner + fallback value, so one failure can't freeze the view. */
  private safe<T>(source: Observable<T>, fallback: T, what: string): Observable<T> {
    return source.pipe(
      catchError((e) => {
        console.error(`[Chat] failed to load ${what}`, e);
        this.showError(`تعذّر تحميل ${what}`, e);
        return of(fallback);
      })
    );
  }

  private showError(message: string, e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'storage/retry-limit-exceeded' || code === 'storage/unknown') {
      this.loadError.set(
        `${message}: Firebase Storage مش متفعّل. لازم Upgrade لخطة Blaze وتفعيل Storage من الـ Console`
      );
    } else if (code === 'permission-denied' || code === 'storage/unauthorized') {
      this.loadError.set(`${message}: Firebase رفض الطلب (${code}) — راجع الـ Security Rules`);
    } else {
      this.loadError.set(`${message}${code ? ` (${code})` : ''}`);
    }
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
  upload = signal<{ name: string; progress: number } | null>(null);

  /** Ticks every second so "typing…" disappears when the other side goes quiet. */
  private now = signal(Date.now());
  /** Whether this tab is visible: we only mark messages read when the user can see them. */
  private pageVisible = signal(typeof document === 'undefined' || !document.hidden);

  private isTyping(chat: ChatMeta | undefined, uid: string) {
    const t = chat?.typing?.[uid];
    return !!t && this.now() - t.toMillis() < TYPING_TTL_MS;
  }

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
      .map((u) => {
        const chat = byOther.get(u.uid);
        return {
          ...u,
          chat,
          unread: u.uid === this.selectedUid() ? 0 : (chat?.unread?.[myUid] ?? 0),
          typing: this.isTyping(chat, u.uid),
        };
      })
      .sort((a, b) => {
        const ta = a.chat?.updatedAt?.toMillis() ?? 0;
        const tb = b.chat?.updatedAt?.toMillis() ?? 0;
        return tb - ta || (a.displayName ?? '').localeCompare(b.displayName ?? '');
      });
  });

  totalUnread = computed(() => this.contacts().reduce((n, c) => n + c.unread, 0));

  selected = computed(() => this.users().find((u) => u.uid === this.selectedUid()) ?? null);

  private activeChatId = computed(() => {
    const me = this.me();
    const other = this.selectedUid();
    return me && other ? chatIdFor(me.uid, other) : null;
  });

  private activeChat = computed(() => this.chats().find((c) => c.id === this.activeChatId()));

  otherTyping = computed(() => {
    const other = this.selectedUid();
    return !!other && this.isTyping(this.activeChat(), other);
  });

  /** When the other person last read this chat; my messages up to then get ✓✓. */
  private otherLastRead = computed(() => {
    const other = this.selectedUid();
    return (other && this.activeChat()?.lastRead?.[other]?.toMillis()) || 0;
  });

  messages = toSignal(
    toObservable(this.activeChatId).pipe(
      switchMap((id) => (id ? this.safe(this.chatService.messages$(id), [], 'الرسائل') : of([])))
    ),
    { initialValue: [] }
  );

  /** Typing state for the chat I'm currently writing in. */
  private typingSentAt = 0;
  private typingChat: { id: string; other: string } | null = null;
  private typingIdleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Scroll to the newest message when a chat opens, a new message arrives, or the other
    // side starts typing — but not when a reaction or edit changes an older message
    // (that would yank the view while reading history).
    afterRenderEffect(() => {
      const msgs = this.messages();
      const key = `${this.activeChatId()}|${msgs.at(-1)?.id ?? ''}|${this.otherTyping()}`;
      const el = this.scroller()?.nativeElement;
      if (!el || key === this.scrolledFor) return;
      this.scrolledFor = key;
      el.scrollTop = el.scrollHeight;
    });

    // Mark the open chat as read whenever it has unread messages for me and I can see it.
    effect(() => {
      const me = this.me();
      const other = this.selectedUid();
      const chat = this.activeChat();
      if (!me || !other || !chat || !this.pageVisible()) return;
      if ((chat.unread?.[me.uid] ?? 0) > 0) {
        untracked(() =>
          this.chatService
            .markRead(chat.id, me.uid, other)
            .catch((e) => console.error('[Chat] markRead failed', e))
        );
      }
    });

    // Make sure my profile exists (and mark me online): the session may be restored
    // without going through login, and older accounts may be missing users/{uid}.
    effect(() => {
      if (!this.authUser()) return;
      untracked(() =>
        this.auth.ensureProfile().catch((e) => {
          console.error('[Chat] ensureProfile failed', e);
          this.showError('تعذّر حفظ بياناتك في Firestore، فمحدش هيقدر يشوفك في القايمة', e);
        })
      );
    });

    if (typeof window !== 'undefined') {
      const tick = setInterval(() => this.now.set(Date.now()), 1000);
      const onVisibility = () => this.pageVisible.set(!document.hidden);
      const onPageHide = () => {
        this.stopTyping();
        this.auth.setPresence(false);
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      this.destroyRef.onDestroy(() => {
        clearInterval(tick);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
        this.stopTyping();
      });
    }
  }

  /** Inserts the emoji where the caret is (or replaces the selection) and keeps focus. */
  insertEmoji(emoji: string) {
    const el = this.composerInput()?.nativeElement;
    const value = this.draft();
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    this.onInput(next);
    if (el) {
      el.value = next; // sync now so the caret can be placed before the next render
      const caret = start + emoji.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    }
  }

  /** 1–3 emoji and nothing else: shown large, like other chat apps. */
  isEmojiOnly(text: string) {
    const t = text.trim();
    if (!t || t.length > 24) return false;
    if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t)) {
      return false;
    }
    const count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)]
      .filter((s) => s.segment.trim()).length;
    return count <= 3 && !/^[\d#*\s]+$/.test(t);
  }

  open(uid: string) {
    if (uid === this.selectedUid()) return;
    this.emojiOpen.set(false);
    this.stopTyping();
    this.resetComposeMode();
    this.selectedUid.set(uid);
    this.draft.set('');
  }

  back() {
    this.stopTyping();
    this.resetComposeMode();
    this.selectedUid.set(null);
  }

  onEscape() {
    if (this.viewer()) this.viewer.set(null);
    else if (this.emojiOpen()) this.emojiOpen.set(false);
    else if (this.editing() || this.replyingTo()) this.cancelComposeMode();
  }

  // ---------- Reply / edit / delete / reactions ----------

  /** Display name for a sender uid, "You" for me. */
  senderName(uid: string) {
    if (uid === this.me()?.uid) return 'You';
    return this.users().find((u) => u.uid === uid)?.displayName ?? '';
  }

  preview(m: Message) {
    return messagePreview(m);
  }

  canEdit(m: Message) {
    return this.isMine(m) && !m.deleted && (m.type ?? 'text') !== 'file';
  }

  startReply(m: Message) {
    this.editing.set(null);
    this.replyingTo.set(m);
    this.focusComposer();
  }

  startEdit(m: Message) {
    if (!this.canEdit(m)) return;
    this.replyingTo.set(null);
    this.editing.set(m);
    this.draft.set(m.text ?? '');
    this.focusComposer(true);
  }

  cancelComposeMode() {
    if (this.editing()) this.draft.set('');
    this.resetComposeMode();
  }

  private resetComposeMode() {
    this.editing.set(null);
    this.replyingTo.set(null);
  }

  private focusComposer(selectEnd = false) {
    setTimeout(() => {
      const el = this.composerInput()?.nativeElement;
      if (!el) return;
      el.focus();
      if (selectEnd) el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  private isLatest(m: Message) {
    return this.messages().at(-1)?.id === m.id;
  }

  /** Reactions grouped by emoji, with whether I'm one of the reactors. */
  reactionSummary(m: Message) {
    const myUid = this.me()?.uid;
    const groups = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const [uid, emoji] of Object.entries(m.reactions ?? {})) {
      if (!emoji) continue;
      const g = groups.get(emoji) ?? { emoji, count: 0, mine: false };
      g.count++;
      g.mine ||= uid === myUid;
      groups.set(emoji, g);
    }
    return [...groups.values()];
  }

  /** Picking my current reaction again removes it; picking another one replaces it. */
  toggleReaction(m: Message, emoji: string) {
    const me = this.me();
    const chatId = this.activeChatId();
    if (!me || !chatId || m.deleted) return;
    const next = m.reactions?.[me.uid] === emoji ? null : emoji;
    this.chatService.react(chatId, m.id, me.uid, next).catch((e) => {
      console.error('[Chat] reaction failed', e);
      this.showError('الـ reaction ما اتحفظش', e);
    });
  }

  deleteMessage(m: Message) {
    const me = this.me();
    const other = this.selectedUid();
    if (!me || !other || !this.isMine(m) || m.deleted) return;
    if (!confirm('تمسح الرسالة دي عند الكل؟')) return;
    if (this.editing()?.id === m.id) this.cancelComposeMode();
    this.chatService.deleteMessage(me.uid, other, m, this.isLatest(m)).catch((e) => {
      console.error('[Chat] delete failed', e);
      this.showError('الرسالة ما اتمسحتش', e);
    });
  }

  /** Jumps to the original message of a reply quote and flashes it. */
  scrollToMessage(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      this.loadError.set('الرسالة الأصلية قديمة ومش ظاهرة في المحادثة');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.highlightId.set(id);
    setTimeout(() => {
      if (this.highlightId() === id) this.highlightId.set(null);
    }, 1600);
  }

  isMine(m: Message) {
    return m.senderId === this.me()?.uid;
  }

  isSeen(m: Message) {
    return !!m.createdAt && m.createdAt.toMillis() <= this.otherLastRead();
  }

  onInput(value: string) {
    this.draft.set(value);
    const me = this.me();
    const other = this.selectedUid();
    const chatId = this.activeChatId();
    if (!me || !other || !chatId) return;

    if (!value.trim()) {
      this.stopTyping();
      return;
    }

    if (Date.now() - this.typingSentAt > TYPING_REFRESH_MS) {
      this.typingSentAt = Date.now();
      this.typingChat = { id: chatId, other };
      this.chatService.setTyping(chatId, me.uid, other, true).catch(() => {});
    }
    clearTimeout(this.typingIdleTimer);
    this.typingIdleTimer = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
  }

  private stopTyping() {
    clearTimeout(this.typingIdleTimer);
    const me = this.me();
    if (this.typingChat && me) {
      const { id, other } = this.typingChat;
      this.chatService.setTyping(id, me.uid, other, false).catch(() => {});
    }
    this.typingChat = null;
    this.typingSentAt = 0;
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  send() {
    const me = this.me();
    const other = this.selectedUid();
    const text = this.draft().trim();
    if (!me || !other) return;

    const editing = this.editing();
    if (editing) {
      // An image keeps its photo, so its caption may be cleared; text needs content.
      if (!text && (editing.type ?? 'text') === 'text') return;
      this.stopTyping();
      this.resetComposeMode();
      this.draft.set('');
      if (text === (editing.text ?? '').trim()) return; // nothing changed
      this.chatService
        .editMessage(me.uid, other, editing, text, this.isLatest(editing))
        .catch((e) => {
          console.error('[Chat] edit failed', e);
          this.showError('التعديل ما اتحفظش', e);
        });
      return;
    }

    if (!text) return;
    const replyTo = this.replyingTo();

    // The send batch also clears my typing flag.
    clearTimeout(this.typingIdleTimer);
    this.typingChat = null;
    this.typingSentAt = 0;

    this.draft.set('');
    this.replyingTo.set(null);
    // Firestore shows the message right away from its local cache; the promise only
    // resolves once the server confirms, so don't block the composer on it.
    this.chatService.send(me.uid, other, text, undefined, replyTo).catch((e) => {
      console.error('[Chat] send failed', e);
      this.showError('الرسالة ما اتبعتتش', e);
      if (!this.draft()) this.draft.set(text); // give the text back so it isn't lost
    });
  }

  pickFile() {
    this.fileInput()?.nativeElement.click();
  }

  async onFileSelected(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    const me = this.me();
    const other = this.selectedUid();
    const chatId = this.activeChatId();
    if (!file || !me || !other || !chatId || this.upload()) return;

    // Without Firebase Storage (Spark plan), photos are compressed and stored inside the
    // message document itself; other file types have nowhere to go.
    if (!file.type.startsWith('image/')) {
      this.loadError.set('حاليًا تقدر تبعت صور بس. الملفات التانية محتاجة Firebase Storage (خطة Blaze)');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.loadError.set('الصورة أكبر من 10 MB');
      return;
    }

    // Picking a photo while editing starts a fresh message instead.
    if (this.editing()) this.cancelComposeMode();
    const caption = this.draft().trim();
    const replyTo = this.replyingTo();
    this.upload.set({ name: file.name, progress: 30 });
    try {
      const img = await compressImage(file, 1280);
      this.upload.set({ name: file.name, progress: 80 });
      this.draft.set('');
      this.replyingTo.set(null);
      this.chatService
        .send(
          me.uid,
          other,
          caption,
          {
            type: 'image',
            fileUrl: img.dataUrl,
            fileName: file.name,
            fileSize: img.bytes,
            contentType: 'image/jpeg',
          },
          replyTo
        )
        .catch((e) => {
          console.error('[Chat] sending image failed', e);
          this.showError('الصورة ما اتبعتتش', e);
          if (!this.draft()) this.draft.set(caption);
        });
    } catch (e) {
      console.error('[Chat] image processing failed', e);
      const code = (e as { code?: string })?.code;
      this.loadError.set(
        code === 'image/too-large'
          ? 'الصورة كبيرة أوي حتى بعد الضغط، جرّب صورة تانية'
          : 'تعذّر قراءة الصورة، جرّب JPG أو PNG'
      );
    } finally {
      this.upload.set(null);
    }
  }

  async logout() {
    this.stopTyping();
    try {
      await this.auth.logout();
    } catch (e) {
      console.error('[Chat] logout failed', e);
    } finally {
      // Always leave the page, even if marking offline or signOut had a hiccup.
      await this.router.navigate(['/login'], { replaceUrl: true });
    }
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
