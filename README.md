# Live Polling App

A real-time polling application for classroom use at Columbia Business School.

## Features

- Create multiple-choice polls with unlimited questions
- Real-time voting with instant results updates
- Cross-tabulation analysis for comparing two questions
- Mobile-optimized voting interface
- Presentation mode for large screen display
- Admin controls for poll state and results reveal

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Python (Vercel Serverless Functions)
- **Database**: Supabase (PostgreSQL + Real-time)
- **Charts**: Recharts
- **Hosting**: Vercel

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to the SQL Editor and run the schema from `supabase/migrations/001_initial_schema.sql`
3. Copy your project URL and API keys from Settings > API

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
ADMIN_PASSWORD_HASH=your-bcrypt-hash
JWT_SECRET=your-random-secret
```

Generate password hash:
```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"
```

### 3. Install Dependencies

```bash
cd frontend
npm install
```

### 4. Run Locally

```bash
npm run dev
```

Visit http://localhost:5173

## Deployment

### Deploy to Vercel

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

## Usage

### Admin

1. Go to `/admin` and enter your password
2. Create a new poll and add questions
3. Set poll state to "Open" to allow voting
4. Share the voting link with participants
5. Project the results link on a big screen
6. Reveal results when ready

### Participants

1. Open the voting link on any device
2. Answer all questions
3. Wait for results to be revealed

### Results Display

1. Open the results link
2. Toggle "Presentation Mode" for large screens
3. Select two questions for cross-tabulation analysis

## Project Structure

```
live-polling-app/
├── frontend/           # React application
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── contexts/   # React contexts
│   │   ├── services/   # API & Supabase clients
│   │   └── types/      # TypeScript types
│   └── package.json
├── api/                # Python serverless functions
│   ├── admin/          # Admin authentication
│   ├── polls/          # Poll CRUD
│   ├── questions/      # Question CRUD
│   ├── responses/      # Vote submission
│   ├── sessions/       # Participant sessions
│   └── utils/          # Shared utilities
├── supabase/           # Database migrations
└── vercel.json         # Deployment config
```

## License

MIT
