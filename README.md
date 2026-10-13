# PollAnywhere (Live Polling App)

A real-time polling application for classroom use at Columbia Business School — an
alternative to Poll Everywhere.

## Features

- Create multiple-choice polls with unlimited questions (single answer or "check all that apply")
- Reveal questions to participants one at a time, and reveal results per question or all at once
- Live results for a projector, with presentation mode and cross-tabulation of two questions
- Mobile-optimized voting; students sign in once at the class hub and can change answers until the poll closes
- Projected results stay aggregate; each student's answers go to the class hub's activity log
- The class hub's instructors and TAs run polls (no separate admin accounts)

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Recharts (`frontend/`)
- **API**: Vercel serverless functions in TypeScript (`api/`)
- **Database**: Neon Postgres via the `@neondatabase/serverless` HTTP driver
- **Sign-in**: the class hub (one Google sign-in for every class app; its session cookie is
  verified with `jose`)
- **Hosting**: Vercel

The browser never talks to the database: every read and write goes through `api/app.ts`.
Live updates come from polling (pages refresh poll state every second; the shared
poll-state response is cached at the Vercel CDN for one second, so a full classroom
costs about one function call per second).

## Sign-in and activity (class hub)

Everyone signs in once, at the class hub. The hub sets a session cookie (an ES256 JWT) on its
cookie domain, so the app must be served under it (preview: `polls.preview.cbs-tech-strategy.com`).

- **Pages:** `frontend/src/main.tsx` calls `requireUser()` from the browser kit
  (`frontend/src/lib/hub.ts`, configured by `VITE_HUB_URL` / `VITE_HUB_APP_SLUG`) before rendering;
  signed-out visitors go to the hub's `/renew` and come back signed in. The hub cookie lasts 24 h
  and renews silently, so students stay signed in.
- **API:** `api/_lib/auth.ts` verifies the cookie with the server kit (`api/_lib/hub.ts`) on every
  request that reads or writes a student's answers (`requireUser`) or runs a poll
  (`requireStaff`: the hub's instructors and TAs, who share every poll). The API never takes a
  user id from the request body. Students who open an admin page see "Instructors only".
- **Voters:** one participant session per student per poll, keyed by `sessions.student_id`
  (the hub person id).
- **Activity log:** each student's answers to a poll are one entry in the hub
  (`poll.answered`, run id `<poll id>:<student id>`), re-reported with all their answers whenever
  they change one and once more, marked final, when the poll closes (`api/_lib/pollEvents.ts`).
  Instructors see the answers by name in the hub; the projected results stay aggregate.
- **Hold and resend:** reports go through the `hub_outbox` table (`api/_lib/outbox.ts`) and are
  sent after responding; anything the hub didn't receive is resent with the next report, by the
  daily sweep (`/api/hub/sweep`, Vercel Cron in `vercel.json`, production only, needs
  `CRON_SECRET`), or by "Send now" on the admin dashboard, which shows how many are waiting.

## Setup

1. Create a Neon project and run `schema.sql` in the Neon SQL Editor (an existing database:
   run `db/hub-migration.sql`).
2. Create an app key for `pollanywhere` in the hub admin (App keys).
3. Set the environment variables listed in `.env.example` in Vercel (the `VITE_` ones are read
   when the frontend is built).
4. Add the app's domain under the hub's cookie domain and deploy (Vercel builds `frontend/` and
   the functions in `api/` per `vercel.json`).

### Run locally

```bash
npm install && (cd frontend && npm install)
vercel env pull .env.local   # or fill in .env.local from .env.example
vercel dev                   # serves the frontend and the /api functions
```

`cd frontend && npm run dev` serves the UI alone (without the API).

## Usage

### Instructors and TAs

1. Go to `/admin` (signed in at the class hub as an instructor or TA).
2. Create a poll and add questions; set the poll to "Open" and use "Show All" (or the per-question
   eye toggle) to reveal questions to participants.
3. Share the voting link and project the results link; reveal results when ready.

### Participants

1. Open the voting link on any device (signed in at the class hub) and answer the visible questions
2. Answers can be changed until the poll closes

### Results display

1. Open the results link
2. Toggle "Presentation Mode" for large screens
3. Select two questions for cross-tabulation analysis

## API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/live/:code` | public (aggregate, CDN-cached 1 s) | Poll, questions and revealed counts for the voting/results pages |
| `GET /api/live/:code/crosstab?q1&q2` | public (anonymous, CDN-cached 1 s) | Anonymous answers to two revealed questions |
| `POST /api/sessions`, `GET /api/sessions/mine?poll_id` | signed in | Join a poll / reload your answers |
| `POST /api/responses` | signed in | Replace your answer(s) to one question |
| `/api/admin/polls…`, `/api/admin/questions…`, `/api/admin/options…` | instructor or TA | Poll editing |
| `GET`/`POST /api/admin/hub/outbox` | instructor or TA | Reports waiting for the class hub / Send now |
| `GET /api/hub/sweep` | `CRON_SECRET` | Daily resend of waiting reports |

## Project Structure

```
live-polling-app/
├── frontend/           # React application
│   └── src/
│       ├── components/ # UI components (admin, voting, results)
│       ├── contexts/   # Signed-in user (from the class hub) and participant session
│       ├── lib/        # Class hub browser kit (hub.ts)
│       ├── services/   # API client (api.ts)
│       └── types/      # TypeScript types
├── api/                # Vercel function: app.ts (all data)
│   └── _lib/           # db, class hub kit (hub.ts), auth, outbox, activity reports, HTTP helpers
├── db/                 # hub-migration.sql for existing databases
├── schema.sql          # Database schema
└── vercel.json         # Build + rewrites
```

## License

MIT
