import { Component, ElementRef, computed, inject, output, signal } from '@angular/core';
import { EMOJI_CATEGORIES } from './emoji-data';

const RECENT_KEY = 'chat.recentEmojis';
const MAX_RECENT = 24;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Lightweight emoji picker (no external dependency). Emits every picked emoji and
 * stays open so several can be added; closes on outside click or Escape.
 */
@Component({
  selector: 'app-emoji-picker',
  host: {
    class: 'emoji-picker',
    role: 'dialog',
    'aria-label': 'Emoji picker',
    '(document:pointerdown)': 'onOutsidePointer($event)',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <nav class="emoji-tabs" role="tablist">
      @if (recent().length) {
        <button
          type="button"
          role="tab"
          [class.active]="active() === 'recent'"
          [attr.aria-selected]="active() === 'recent'"
          (click)="active.set('recent')"
          title="Recently used"
        >🕘</button>
      }
      @for (c of categories; track c.id) {
        <button
          type="button"
          role="tab"
          [class.active]="active() === c.id"
          [attr.aria-selected]="active() === c.id"
          (click)="active.set(c.id)"
          [title]="c.label"
        >{{ c.icon }}</button>
      }
    </nav>
    <div class="emoji-title">{{ title() }}</div>
    <div class="emoji-grid">
      @for (e of shown(); track $index) {
        <button type="button" (click)="pick(e)" [attr.aria-label]="e">{{ e }}</button>
      }
    </div>
  `,
})
export class EmojiPicker {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  picked = output<string>();
  closed = output<void>();

  readonly categories = EMOJI_CATEGORIES;
  recent = signal<string[]>(loadRecent());
  active = signal<string>(this.recent().length ? 'recent' : EMOJI_CATEGORIES[0].id);

  shown = computed(() =>
    this.active() === 'recent'
      ? this.recent()
      : (this.categories.find((c) => c.id === this.active())?.emojis ?? [])
  );

  title = computed(() =>
    this.active() === 'recent'
      ? 'Recently used'
      : (this.categories.find((c) => c.id === this.active())?.label ?? '')
  );

  pick(emoji: string) {
    this.picked.emit(emoji);
    const next = [emoji, ...this.recent().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    this.recent.set(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* private mode etc. — recents just won't persist */
    }
  }

  onOutsidePointer(e: PointerEvent) {
    const target = e.target as Node | null;
    if (!target || this.host.nativeElement.contains(target)) return;
    // The toggle button handles its own click; don't close-then-reopen.
    if ((target as Element).closest?.('[data-emoji-toggle]')) return;
    this.closed.emit();
  }
}
