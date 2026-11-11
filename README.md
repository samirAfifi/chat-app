# Real-time Chat App

One-to-one messaging app built with **Angular 21** and **Firebase**. Messages, read receipts, typing status and reactions update live through Cloud Firestore streams, with no page refresh and no custom backend.

**🔗 Live demo: [chat-app-a81b3.web.app](https://chat-app-a81b3.web.app)**. Sign up with two accounts (one in a private window) to chat between them.

<!-- Add a screenshot or GIF here, e.g. ![Chat screen](docs/screenshot.png) -->

## Features

### Messaging
- **Live one-to-one chat** streamed from Firestore with RxJS (`collectionData`), with optimistic sends from the local cache
- **Read receipts:** ✓ sent, ✓✓ seen, driven by each member's `lastRead` timestamp
- **Unread counters** per conversation and in total, cleared only while the chat is visible on screen
- **Typing indicator** with throttled writes, an idle timeout and expiry for stale signals
- **Reply** to a message with a quoted preview; clicking the quote jumps to and highlights the original
- **Reactions** (👍 ❤️ 😂 😮 😢 🙏), one per user, plus double-click to ❤️
- **Edit** and **delete for everyone**, with an "edited" label and a deleted placeholder
- **Emoji picker** with categories and recently used, built from scratch; emoji-only messages render large
- **Photo sharing** without Firebase Storage: images are resized and compressed in the browser (Canvas, EXIF-aware) and stored inline, with an in-page photo viewer

### Users
- **Authentication:** email/password and Google sign-in with Firebase Authentication, with friendly error messages
- **Route guards:** `authGuard` for the chat and profile pages, `guestGuard` for login and register
- **Profile page:** edit display name and avatar
- **Presence:** online dot and online/offline status
- **Contact list:** search, last-message preview, time, sorted by most recent conversation

### Engineering
- **Security rules** ([`firestore.rules`](firestore.rules)): only chat members can read or write a conversation; users may change only their own reaction; only the sender can edit or delete a message
- **Modern Angular:** standalone components, Signals (`signal`, `computed`, `effect`, `afterRenderEffect`), `toSignal`/`toObservable` interop, new control flow, lazy-loaded routes
- **Resilient UI:** stream errors surface as a dismissible banner instead of freezing the view; network writes never block the composer
- **Responsive:** two-pane layout on desktop, single pane with back navigation on phones

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | Angular 21, TypeScript, RxJS, Signals |
| UI | Angular Material 3, SCSS |
| Backend | Firebase Authentication, Cloud Firestore (`@angular/fire`), Security Rules |
| Rendering | Angular SSR (Express), client-side routes |
| Testing | Vitest |

## Data model

```
users/{uid}
  displayName, email, photoURL, avatar, isOnline

chats/{uidA_uidB}
  members[], lastMessage, lastSenderId, updatedAt,
  unread{uid: n}, lastRead{uid: time}, typing{uid: time}

chats/{uidA_uidB}/messages/{id}
  senderId, type (text | image), text, fileUrl?, replyTo?,
  reactions{uid: emoji}, editedAt?, deleted?, createdAt
```

The chat id is both user ids sorted and joined, so A→B and B→A share one conversation, and security rules can check membership from the path without an extra read. A message and its chat summary are written in one batch so the contact list never shows a message that doesn't exist.

## Project structure

```
src/app/
├── Authentication/
│   ├── Components/   login, register
│   ├── guards/       authGuard, guestGuard
│   └── services/     AuthService (auth, presence, profile)
├── Chat/
│   ├── Components/   chat (contacts + conversation), emoji-picker
│   └── services/     ChatService (queries, send, read receipts, typing, reactions, edit/delete)
├── Profile/
│   └── Components/   profile
└── shared/           image-compress (Canvas resize + JPEG)
```

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:4200/`. To use your own Firebase project:

1. Create a project with **Authentication** (Email/Password and Google) and **Cloud Firestore**.
2. Put its web config in `src/environments/environment.development.ts` and `environment.ts`.
3. Publish [`firestore.rules`](firestore.rules) from the Firestore **Rules** tab.

To try the chat, sign in with two accounts in two browser windows (one normal, one private).

## Deploy

The app is deployed as a static client-side build on **Firebase Hosting** (free tier):

```bash
npx firebase-tools login   # once
npm run deploy             # static build + firebase deploy --only hosting
```

## Author

**Samir Afifi**, Angular Frontend Developer: [LinkedIn](https://www.linkedin.com/in/samir-afifi) · [GitHub](https://github.com/samirAfifi)
