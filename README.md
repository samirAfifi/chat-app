# Real-time Chat App

One-to-one messaging app built with **Angular 21** and **Firebase**. Messages arrive live through Cloud Firestore streams; no page refresh needed.

## Features

- **Authentication:** email/password register and login, plus Google sign-in, with Firebase Authentication
- **Route guards:** the chat page is protected; signed-out users are redirected to login
- **Clear auth errors:** Firebase error codes mapped to friendly messages
- **Live messaging:** one-to-one chats streamed from Firestore with RxJS (`collectionData`)
- **Contact list:** online status, search, and last-message preview with time
- **Modern Angular:** standalone components, Signals (`signal`, `computed`), new control flow (`@if`, `@for`), lazy-loaded routes, SSR

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | Angular 21, TypeScript, RxJS |
| UI | Angular Material, SCSS |
| Backend | Firebase Authentication, Cloud Firestore (`@angular/fire`) |
| Rendering | Angular SSR (Express) |
| Testing | Vitest |

## Data model

```
users/{uid}                    displayName, email, photoURL, isOnline
chats/{uidA_uidB}              members[], lastMessage, lastSenderId, updatedAt
chats/{uidA_uidB}/messages/{id}  senderId, text, createdAt
```

The chat id is both user ids sorted and joined, so A→B and B→A share one conversation.

## Project structure

```
src/app/
├── Authentication/
│   ├── Components/   login, register
│   ├── guards/       authGuard
│   └── services/     AuthService
└── Chat/
    ├── Components/   chat (contacts + conversation)
    └── services/     ChatService (Firestore queries and send)
```

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:4200/`. The Firebase config lives in `src/environments/environment.development.ts`.

## Author

**Samir Afifi**, Angular Frontend Developer: [LinkedIn](https://www.linkedin.com/in/samir-afifi) · [GitHub](https://github.com/samirAfifi)
