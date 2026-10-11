# PollAnywhere (Live Polling App)

A real-time polling application for classroom use at Columbia Business School — an
alternative to Poll Everywhere.

## Features

- Create multiple-choice polls with unlimited questions (single answer or "check all that apply")
- Reveal questions to participants one at a time, and reveal results per question or all at once
- Live results for a projector, with presentation mode and cross-tabulation of two questions
- Mobile-optimized, anonymous voting (no login for participants)
- Multiple admins: anyone can request access with Google; a superadmin approves requests

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Recharts (`frontend/`)
- **API**: Vercel serverless functions in TypeScript (`api/`)
- **Database**: Neon Postgres via the `@neondatabase/serverless` HTTP driver
- **Admin auth**: Neon Auth (Google sign-in) plus a superadmin password
- **Hosting**: Vercel

The browser never talks to the database: every read and write goes through `api/app.ts`.
Live updates come from polling (pages refresh poll state every second; the shared
poll-state response is cached at the Vercel CDN for one second, so a full classroom
costs about one function call per second).

## Setup

1. Create a Neon project and run `schema.sql` in the Neon SQL Editor. It seeds the
   superadmin (`djw2104@columbia.edu`); edit the last statement to use a different one.
2. In Neon Console → Auth, enable Neon Auth with Google, and add your site's URL
   (e.g. `https://your-app.vercel.app`) under trusted domains.
3. Set the environment variables listed in `.env.example` in Vercel.
4. Deploy (Vercel builds `frontend/` and the functions in `api/` per `vercel.json`).

### Run locally

```bash
npm install && (cd frontend && npm install)
vercel env pull .env.local   # or fill in .env.local from .env.example
vercel dev                   # serves the frontend and the /api functions
```

`cd frontend && npm run dev` serves the UI alone (without the API).

## Usage

### Admins

1. Go to `/admin`. The superadmin can sign in with the password; everyone signs in with Google.
2. New admins click "Request access", sign in with Google, and wait for a superadmin to approve them.
3. Create a poll and add questions; set the poll to "Open" and use "Show All" (or the per-question
   eye toggle) to reveal questions to participants.
4. Share the voting link and project the results link; reveal results when ready.

### Participants

1. Open the voting link on any device and answer the visible questions
2. Answers can be changed until the poll closes

### Results display

1. Open the results link
2. Toggle "Presentation Mode" for large screens
3. Select two questions for cross-tabulation analysis

## API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/live/:code` | public | Poll, questions and revealed counts for the voting/results pages |
| `GET /api/live/:code/crosstab?q1&q2` | public | Anonymous answers to two revealed questions |
| `POST /api/sessions`, `GET /api/sessions/:token` | public | Start / restore a participant session |
| `POST /api/responses` | session token | Replace a participant's answer(s) to one question |
| `GET /api/admin/me`, `POST /api/admin/login`, `POST /api/admin/logout`, `POST /api/admin/signup` | — | Admin identity |
| `/api/admin/polls…`, `/api/admin/questions…`, `/api/admin/options…` | approved admin (own polls; superadmin: all) | Poll editing |
| `/api/admin/admins…` | superadmin | Approve, reject and delete admins |
| `/api/auth/*` | — | Same-origin proxy to Neon Auth |

## Project Structure

```
live-polling-app/
├── frontend/           # React application
│   └── src/
│       ├── components/ # UI components (admin, voting, results)
│       ├── contexts/   # Admin identity and participant session
│       ├── services/   # API client (api.ts) and Neon Auth client (auth.ts)
│       └── types/      # TypeScript types
├── api/                # Vercel functions: app.ts (all data), auth.ts (Neon Auth proxy)
│   └── _lib/           # db, auth and HTTP helpers
├── schema.sql          # Database schema
└── vercel.json         # Build + rewrites
```

## License

MIT
