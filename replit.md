# EGO - Gamified Daily Task Tracker

## Overview
A personal gamified task management application with an "aura" themed branding. Users earn XP, level up, maintain streaks, and unlock badges by completing daily tasks across categories (Sport, Business, Personal, Health, Education).

## Architecture
- **Frontend**: React + Vite + TailwindCSS + Shadcn UI + Framer Motion
- **Backend**: Express.js with Replit Auth (OpenID Connect)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Replit Auth integration (server/replit_integrations/auth/)

## Key Files
- `shared/schema.ts` - All data models (tasks, userProgress, badges, userBadges) + re-exports auth models
- `shared/models/auth.ts` - Users and sessions tables (Replit Auth)
- `server/routes.ts` - API endpoints for tasks, progress, badges, activity
- `server/storage.ts` - DatabaseStorage with all CRUD operations
- `server/seed.ts` - Badge seeding (14 badges across 4 requirement types)
- `server/db.ts` - Database connection
- `client/src/pages/landing.tsx` - Landing page for unauthenticated users
- `client/src/pages/dashboard.tsx` - Main dashboard for authenticated users
- `client/src/components/` - XP bar, stats cards, task list, badge grid, activity heatmap, category chart

## Gamification System
- **XP**: Earned per task completion (15-100 XP based on difficulty)
- **Levels**: Formula `floor(1 + sqrt(xp / 100))`
- **Streaks**: Consecutive days with completed tasks
- **Badges**: 14 badges across 4 categories (tasks_completed, streak, xp, level)
- **Badge XP Bonus**: Each badge awards bonus XP when unlocked

## Design
- Near-black background (~3% lightness), cards at ~6.5%, borders at ~10-12%
- Primary accent: hsl(270 60% 55%) violet with subtle glow effects
- Fonts: Rajdhani (body — angular, technical), Orbitron (display/headings — aggressive, geometric), JetBrains Mono (numbers/code)
- Minimal, mysterious aesthetic — dark aura theme, no bright colors
- Subtle violet radial glows on icons and key elements
- All components use inline rgba styles for precise opacity control

## Recurring Tasks
- `recurring_tasks` table stores task templates that repeat daily
- When GET /api/tasks is called, recurring tasks are auto-spawned for that date (if not already existing)
- Matching is by title — if a task with the same title already exists for the date, it won't be duplicated
- Users can toggle the repeat icon in the add task form to create a recurring + immediate task
- Recurring tasks panel in sidebar shows active recurring templates with delete option

## Authentication
- Independent username/password authentication (no Replit Auth)
- Passwords hashed with bcryptjs (12 rounds)
- Sessions stored in PostgreSQL via connect-pg-simple (1 week TTL)
- POST /api/register — create account (username min 3 chars, password min 6 chars)
- POST /api/login — authenticate
- POST /api/logout — destroy session
- GET /api/auth/user — get current user (excludes password)
- userId accessed via req.session.userId in backend routes

## Journal
- `journal_entries` table: userId, content, mood (1-5), energy (1-5), xpAwarded, date
- Unique constraint on (userId, date) — one entry per user per day
- First save of the day awards +15 XP (only for today's date, enforced server-side)
- Mood emoji selector (5 levels), energy bar (1-5 colored), textarea for reflection
- SVG line charts for mood/energy trends over 30 days
- Past entries list with collapse/expand
- Atomic upsert with race-condition handling (catches duplicate key errors)

## Focus Mode
- `focus_sessions` table: userId, duration, date, completedAt
- POST /api/focus/complete — validates duration >= 60s, awards 25 XP
- Cinematic full-screen timer with violet breathing glow
- Categories integrated for session tagging

## Character Card
- RPG-style radar chart showing category stats
- html2canvas for card export as image
- Five axes: Sport, Business, Perso, Santé, Éducation

## Progression Timeline
- Scroll-driven violet glow line with milestones from all XP sources
- Milestone types: badge, level_up, productive_day (≥3 tasks), streak_record (≥3 days)

## API Routes (all protected with isAuthenticated)
- GET /api/tasks?date=YYYY-MM-DD - Get tasks for a date (auto-spawns recurring)
- POST /api/tasks - Create task
- PATCH /api/tasks/:id/complete - Complete task (awards XP, updates streak, checks badges)
- PATCH /api/tasks/:id/uncomplete - Uncomplete task (removes XP)
- DELETE /api/tasks/:id - Delete task
- GET /api/progress - Get user progress (XP, level, streak)
- GET /api/recurring - Get active recurring task templates
- POST /api/recurring - Create recurring task template
- DELETE /api/recurring/:id - Delete recurring task template
- GET /api/badges - Get all badges
- GET /api/badges/mine - Get user's unlocked badges
- GET /api/activity - Get activity heatmap data
- GET /api/stats - Get task stats by category
- GET /api/journal - Get all journal entries
- POST /api/journal - Create/update journal entry (awards 15 XP for first daily entry)
- GET /api/journal/:date - Get journal entry for a specific date
- GET /api/journal/insights - Get mood/energy insights for last 30 days
- POST /api/focus/complete - Complete focus session (awards 25 XP)
- GET /api/xp-history - Get XP event history for timeline
