# The Third Eye — Complete Feature Document

> **Version:** 0.1.0 · **Last Updated:** July 27, 2026  
> **App URL:** [thethirdeye.app](https://thethirdeye.app)

---

## Table of Contents

1. [App Overview](#app-overview)
2. [Navigation & Layout](#navigation--layout)
3. [Core Features](#core-features)
4. [Studio (Creative Engine)](#studio-creative-engine)
5. [Specialized Components](#specialized-components)
6. [Mobile Experience](#mobile-experience)
7. [JARVIS AI Assistant](#jarvis-ai-assistant)
8. [Screenshot Capture Guide](#screenshot-capture-guide)

---

## App Overview

The Third Eye is a JARVIS-inspired AI operating system that unifies productivity, creativity, business, and life management into a single interface. It features:

- **3 Mode-Aware Studios** (Hobby, Startup, Office) with 27+ creative tools
- **JARVIS AI Assistant** with 18+ autonomous asset-generation tools
- **Full workspace** (Tasks, Notes, Goals, Knowledge, Life Log)
- **Mobile-responsive** with hamburger drawer navigation
- **Dark theme** with accent-reactive UI (Arc Reactor branding)

---

## Navigation & Layout

### Left Sidebar (Desktop)
- **Logo:** Arc Reactor animation with "The Third Eye" branding
- **Mode Switcher:** Toggle between Personal / Professional / Enterprise modes
- **Navigation Groups:**
  - Overview: Dashboard, Assistant, Online Agents, Generations
  - Workspace: Task Tracker, Life Log, Notes, Goals, Knowledge
  - Create & Grow: Studio, Skills, Job Agent, Kolab
  - Apps & Life: Apps, Finance
  - Account & System: Plans & Credits, Capabilities, Agent Activity, App Audit
- **Footer:** Wallet widget, Cloud Sync badge, Settings, User profile + Sign out
- **Collapse/Expand:** PanelLeftClose/PanelLeftOpen toggle

### Mobile Navigation
- **Hamburger icon** (fixed top-left, z-30) opens drawer overlay
- **Backdrop** with blur effect, tap to close
- **Auto-close** on route change (pathname listener)
- **Content padding** (pl-14) to avoid overlap with hamburger button

---

## Core Features

### 1. Dashboard (`/dashboard`)
**Purpose:** Central hub showing recent activity, quick actions, and system status.

**Key Elements:**
- Welcome header with user name
- Recent generations feed
- Quick-action cards for Studio, Assistant, Tasks
- System status indicators

---

### 2. Assistant (`/assistant`)
**Purpose:** JARVIS AI chat interface — the core conversational AI.

**Key Elements:**
- Chat input with mode-aware system prompt
- Message history with markdown rendering
- Source citations and delegation chain display
- Agent name and model attribution
- 18+ autonomous tools including `create_asset` for generating Studio assets from conversation

**JARVIS Tools (from chat):**
| Tool | Description |
|------|-------------|
| `create_asset` | Generate any Studio asset (18 kinds) from conversation |
| `get_insights` | Proactive user insights |
| `get_habits` | User habit analysis |
| `learn_pattern` | Pattern learning (noted, pending backend) |
| `schedule_automation` | Automation scheduling (registered, pending backend) |
| `autonomous_check` | Task and goal monitoring |
| + 12 more | Code generation, deep research, music, health, etc. |

---

### 3. Online Agents (`/agents`)
**Purpose:** View and manage autonomous AI agents running in the background.

---

### 4. Generations (`/generations`)
**Purpose:** Unified log of every asset generated across the app.

**Key Elements:**
- Card grid of all generations (studio, music, kolab, job agent, health, assistant)
- Filter by app/type
- Detail view with full output, inputs, and metadata
- Download button for each generation
- Chronological feed with app color coding

---

### 5. Task Tracker (`/tasks`)
**Purpose:** Kanban-style task management with AI prioritization.

**Key Elements:**
- Task creation with priority, due date, tags
- Drag-and-drop between columns (Todo, In Progress, Done)
- CSV export
- AI-suggested priorities

---

### 6. Life Log (`/lifelog`)
**Purpose:** Time-based journal of activities, moods, and events.

---

### 7. Notes (`/notes`)
**Purpose:** Markdown note-taking with knowledge base integration.

**Key Elements:**
- Note editor with markdown preview
- Download as .md
- Search and filter

---

### 8. Goals (`/goals`)
**Purpose:** Goal tracking with progress visualization.

**Key Elements:**
- Goal creation with target, deadline, milestones
- Progress bars and streak tracking
- CSV export

---

### 9. Knowledge (`/knowledge`)
**Purpose:** RAG-powered knowledge base from uploaded documents.

**Key Elements:**
- Document upload (PDF, DOCX, XLSX, CSV, TXT, MD)
- Chunking and embedding pipeline
- Search with relevance scoring
- Download any document

---

## Studio (Creative Engine)

### Mode-Aware Studios

The Studio adapts to the active mode, showing only relevant tools:

| Mode | Studio Name | Tagline | Accent |
|------|-------------|---------|--------|
| Personal | **Hobby Studio** | Create for the joy of it — music, writing, plans | `#34D399` |
| Professional | **Startup Studio** | Ship growth assets — pages, mailers, decks, ads | `#4FC3F7` |
| Enterprise | **Office Studio** | Run the org — lifecycle, reports, meetings, SOPs | `#A78BFA` |

### Studio Hub (`/tools`)
**Purpose:** Browse all tools organized by category within the active mode.

**Key Elements:**
- Mode tabs at top
- Category sections with tool cards
- Each card shows: icon, label, blurb, accent color
- Click to open tool workbench

---

### Hobby Studio Tools (Personal Mode)

#### 1. Music Studio (`/tools/music`)
**Purpose:** Generate actual music — playable, downloadable audio tracks.

**Key Elements:**
- **Create tab:** Description input, AI auto-fill, genre/mood/tempo sliders, vocal toggle, lyrics mode (auto/manual/none), session length (30s to 5h), video toggle
- **Library tab:** Saved tracks with audio player, download (.mp3), video generation
- **Output:** Playable audio track + optional visualizer video (.webm)
- **AI Features:** Musicologist brief, per-field suggest/enhance/new

**Screenshot:** Show the full Create tab with all controls, and the Library tab with a saved track playing.

#### 2. Creative Studio (`/tools/creative`)
**Purpose:** Text-only creative: song lyrics, music-gen prompts, poems, social captions.

**Fields:** Your idea (textarea), What to create (select: Song lyrics / Music-gen prompt / Poem / Social caption set), Genre/vibe (text)

**Output:** Downloadable .md file

#### 3. Trip Planner (`/tools/travel`)
**Purpose:** Day-by-day travel itinerary tuned to dates, budget, interests.

**Fields:** Destination, Days & dates, Who's going, Budget (Shoestring/Mid-range/Comfortable/Luxury), Interests

**Output:** Downloadable .md itinerary

#### 4. Health Engine (`/tools/health`)
**Purpose:** Nutrition + exercise in one, goal-driven (lose/maintain/gain).

**Key Elements:**
- Custom HealthStudio component
- Calorie & macro targets
- Meal plans + workout plans
- Health events finder

**Output:** Downloadable .md plan

#### 5. Study Coach (`/tools/study`)
**Purpose:** Structured study plan or learning path for any subject.

**Fields:** Subject/skill, Current level, Timeline & hours/week, Target outcome

#### 6. Journal & Reflection (`/tools/journal`)
**Purpose:** Guided journaling prompts or reflective entries.

**Fields:** What do you want (Journaling prompts / Turn notes into reflection / Weekly review / Gratitude list), What's on your mind, Focus

#### 7. Budget Planner (`/tools/budget`)
**Purpose:** Personal monthly budget with category splits and savings tips.

**Fields:** Monthly income, Fixed costs, Savings/goals, Anything else

#### 8. How-To Guide (`/tools/how-to`)
**Purpose:** Step-by-step guide for any life skill or task.

**Fields:** What to learn/do, Current level, Guide style (Step-by-step / Checklist / Roadmap / Troubleshooting), Constraints

#### 9. Social Media Studio (`/tools/social-media`)
**Purpose:** Platform-ready posts, captions, and hooks.

**Fields:** Topic/idea, Platform (Instagram/TikTok/YouTube/LinkedIn/X/Multi), How many (1/5/Week), Tone

#### 10. OTT / Video Studio (`/tools/video`)
**Purpose:** Video scripts and outlines — reels, YouTube, OTT concepts.

**Fields:** Concept, Format (Short-form/YouTube/OTT/Explainer), Audience, Tone/style

**Output:** Production-ready script (.md)

#### 11. Video Avatar Studio (`/tools/avatar`)
**Purpose:** Generate animated avatar video from a script.

**Key Elements:**
- **Canvas animation:** Breathing pulse, waveform bars, pulsing dots, grid pattern
- **Audio track:** AudioContext oscillator synced to animation
- **Live TTS:** Web Speech API plays voice when "Play with voice" clicked
- **4 avatar styles:** Professional 👔, Casual 😊, Anime ✨, Realistic 🧑
- **Download:** .webm video with audio track
- **Generation progress bar**

**Screenshot:** Show the idle state with avatar preview, then the playing state with video + controls.

---

### Startup Studio Tools (Professional Mode)

#### 12. Landing Page Engine (`/tools/landing`)
**Purpose:** Complete, responsive HTML landing page from a product brief.

**Fields:** Product/brand, What it is & why it's great, Target audience, Primary CTA, Tone (Premium/Warm/Bold/Editorial)

**Output:** Full HTML document (.html) — **with "Open in new tab" button**

**Screenshot:** Show the form, then the generated HTML with preview iframe + code view + Open button.

#### 13. HTML Mailer Architect (`/tools/mailer`)
**Purpose:** Email-client-safe, table-based HTML mailer with inline styles.

**Fields:** Campaign goal, Key message & offer, Subject line direction, Call-to-action, Tone

**Output:** Email-safe HTML (.html) — **with "Open in new tab" button**

#### 14. Pitch Deck Outliner (`/tools/pitch`)
**Purpose:** Slide-by-slide investor/sales pitch outline.

**Fields:** Company/product, What it does & traction, Deck for (Seed/Series A/Sales/Internal), Ask

#### 15. Ad Copy Studio (`/tools/adcopy`)
**Purpose:** Performance ad copy — hooks, primary text, headlines, CTAs per channel.

**Fields:** Product/offer, Angle/benefit, Channel (Meta/Google/TikTok/Email), Tone

#### 16. SEO Blog Writer (`/tools/blog`)
**Purpose:** Complete, SEO-structured blog article.

**Fields:** Topic/working title, Primary keyword, Audience & intent, Length (600w/1200w/2000w), Tone

#### 17. Social Content Calendar (`/tools/social`)
**Purpose:** Ready-to-post content calendar across a week or month.

**Fields:** Brand/product, Goal & themes, Platforms, Timeframe (1 week/2 weeks/1 month)

#### 18. Cold Outreach (`/tools/outreach`)
**Purpose:** Multi-step cold email/DM sequence with follow-ups.

**Fields:** What you're offering, Who you're targeting, Channel (Cold email/LinkedIn DM/Both), Sequence length (3/4/5 touches)

#### 19. Naming & Tagline (`/tools/naming`)
**Purpose:** Brandable name ideas and taglines with rationale.

**Fields:** What to name, Positioning & vibe, What to produce (Names+taglines/Names only/Taglines only), Avoid/must-have

#### 20. Campaign Planner (`/tools/campaign`)
**Purpose:** Full multi-channel marketing campaign plan.

**Fields:** Product/offer, Objective & context, Channels, Duration (1 week/2 weeks/1 month/Quarter)

---

### Office Studio Tools (Enterprise Mode)

#### 21. Lifecycle OS (`/tools/lifecycle`)
**Purpose:** Full customer-lifecycle program — stage messaging, channels, timing, KPIs.

**Fields:** Product/segment, Business context & goal, Primary focus (Onboarding/Retention/Win-back/AOV/Full lifecycle), Channels available

#### 22. Meeting Studio (`/tools/meeting`)
**Purpose:** Turn raw notes/transcript into clean minutes with action items.

**Fields:** Notes/transcript, Meeting & attendees, Output (Minutes+actions/Actions only/Executive summary)

#### 23. Report & Memo Studio (`/tools/report`)
**Purpose:** Structured business report, memo, or one-pager.

**Fields:** Report topic, Key points/data, Format (Report/Memo/Brief/Update), Audience

#### 24. SOP & Process Studio (`/tools/sop`)
**Purpose:** Standard-operating-procedure with steps, owners, checks.

**Fields:** Process/task, How it works today, For whom

#### 25. Job Description (`/tools/jd`)
**Purpose:** Polished, inclusive job description.

**Fields:** Role title, Team/company context, Key responsibilities & must-haves, Location & type

#### 26. PRD & Spec (`/tools/prd`)
**Purpose:** Product requirements doc with problem, goals, scope, user stories.

**Fields:** Feature/product, Problem & context, Goals/scope hints, Detail level (One-pager/Standard/Detailed)

#### 27. OKR Planner (`/tools/okr`)
**Purpose:** Objectives and measurable key results with initiatives.

**Fields:** Team/scope, Priorities & context, How many objectives (1/2-3/3-5), Time horizon

#### 28. Proposal & SOW (`/tools/proposal`)
**Purpose:** Client proposal or statement of work.

**Fields:** Client/project, Scope & deliverables, Timeline & pricing hints, Document (Proposal/SOW/Both)

---

## Specialized Components

### Skills (`/skills`)
Browse and install reusable AI skill packs.

### Job Agent (`/job-agent`)
Automated job application assistant with resume/cover letter generation.

### Kolab (`/kolab`)
Collaborative brand workspace with mode-aware playbooks.

### Apps (`/apps`)
Hub for built-in mini-applications and integrations.

### Finance (`/finance`)
Encrypted financial tracking with Fernet AES-128-CBC encryption.

### Plans & Credits (`/plans`)
Subscription tiers and credit management.

### Capabilities (`/capabilities`)
Full feature catalog with interactive demos.

### Agent Activity (`/activity`)
Audit log of all AI agent actions (append-only).

### App Audit (`/audit`)
Security and privacy audit dashboard.

### Settings (`/settings`)
Account, preferences, and system configuration.

---

## Mobile Experience

### Hamburger Menu
- **Trigger:** ☰ icon fixed at top-left (z-30), visible below `lg` breakpoint
- **Drawer:** Fixed left sidebar slides in with backdrop blur
- **Auto-close:** On any nav link tap or route change
- **Backdrop:** Tap anywhere outside to close

### Responsive Layout
- **Desktop:** Full sidebar + main content (pl-0)
- **Mobile:** Hamburger → drawer, main content (pl-14 to avoid overlap)
- **Breakpoint:** `lg` (1024px)

---

## JARVIS AI Assistant

### System Prompt
The assistant operates with mode-aware intelligence:
- **Personal mode:** Creative collaborator, life planner, journaling guide
- **Professional mode:** Growth strategist, copywriter, campaign planner
- **Enterprise mode:** Operations consultant, meeting summarizer, process designer

### Autonomous Capabilities
1. **Asset Generation:** Creates Studio assets directly from conversation via `create_asset` (18 kinds)
2. **Insight Generation:** Proactive suggestions based on user patterns
3. **Habit Learning:** Tracks and learns from user behavior
4. **Task Monitoring:** Autonomous check on overdue tasks and goal deadlines
5. **Pattern Recognition:** Identifies recurring themes and preferences

### Tool Integration
The assistant can invoke any Studio tool from conversation:
```
User: "Create a landing page for my turmeric tea brand"
→ JARVIS calls create_asset(kind="landing", title="Turmeric Tea", brief="...")
→ Generates full HTML landing page
→ Saves to Knowledge base
→ Returns: "Landing page created! Saved to your Knowledge base."
```

---

## Screenshot Capture Guide

To capture all screenshots, run the dev server and use the following script:

```bash
# Start dev server
cd frontend && npm run dev

# In another terminal, run the screenshot script
# (see scripts/capture-screenshots.sh)
```

### Required Screenshots

| # | Page | Route | What to Capture |
|---|------|-------|-----------------|
| 1 | Homepage | `/` | Landing page with hero |
| 2 | Dashboard | `/dashboard` | Full dashboard view |
| 3 | Assistant | `/assistant` | Chat interface with JARVIS |
| 4 | Online Agents | `/agents` | Agent grid |
| 5 | Generations | `/generations` | Generation cards |
| 6 | Task Tracker | `/tasks` | Kanban board |
| 7 | Life Log | `/lifelog` | Timeline view |
| 8 | Notes | `/notes` | Editor + preview |
| 9 | Goals | `/goals` | Goal cards with progress |
| 10 | Knowledge | `/knowledge` | Document list + search |
| 11 | Studio Hub | `/tools` | Tool grid by category |
| 12 | Music Studio | `/tools/music` | Create tab with controls |
| 13 | Music Library | `/tools/music` | Library tab with tracks |
| 14 | Creative Studio | `/tools/creative` | Form + output |
| 15 | Trip Planner | `/tools/travel` | Form + output |
| 16 | Health Engine | `/tools/health` | Custom component |
| 17 | Study Coach | `/tools/study` | Form + output |
| 18 | Journal | `/tools/journal` | Form + output |
| 19 | Budget Planner | `/tools/budget` | Form + output |
| 20 | How-To Guide | `/tools/how-to` | Form + output |
| 21 | Social Media | `/tools/social-media` | Form + output |
| 22 | Video Studio | `/tools/video` | Form + output |
| 23 | Video Avatar | `/tools/avatar` | Avatar preview + controls |
| 24 | Landing Page | `/tools/landing` | Form + HTML preview + Open button |
| 25 | HTML Mailer | `/tools/mailer` | Form + email preview |
| 26 | Pitch Deck | `/tools/pitch` | Form + output |
| 27 | Ad Copy | `/tools/adcopy` | Form + output |
| 28 | SEO Blog | `/tools/blog` | Form + output |
| 29 | Content Calendar | `/tools/social` | Form + output |
| 30 | Cold Outreach | `/tools/outreach` | Form + output |
| 31 | Naming | `/tools/naming` | Form + output |
| 32 | Campaign Planner | `/tools/campaign` | Form + output |
| 33 | Lifecycle OS | `/tools/lifecycle` | Form + output |
| 34 | Meeting Studio | `/tools/meeting` | Form + output |
| 35 | Report Studio | `/tools/report` | Form + output |
| 36 | SOP Studio | `/tools/sop` | Form + output |
| 37 | Job Description | `/tools/jd` | Form + output |
| 38 | PRD & Spec | `/tools/prd` | Form + output |
| 39 | OKR Planner | `/tools/okr` | Form + output |
| 40 | Proposal & SOW | `/tools/proposal` | Form + output |
| 41 | Skills | `/skills` | Skill catalog |
| 42 | Job Agent | `/job-agent` | Application kit |
| 43 | Kolab | `/kolab` | Brand workspace |
| 44 | Apps | `/apps` | App hub |
| 45 | Finance | `/finance` | Finance dashboard |
| 46 | Plans | `/plans` | Pricing tiers |
| 47 | Capabilities | `/capabilities` | Feature catalog |
| 48 | Agent Activity | `/activity` | Audit log |
| 49 | App Audit | `/audit` | Security audit |
| 50 | Settings | `/settings` | Settings panel |
| 51 | Mobile Homepage | `/` (mobile) | Hamburger menu closed |
| 52 | Mobile Drawer | `/` (mobile) | Hamburger menu open |
| 53 | Mobile Assistant | `/assistant` (mobile) | Chat on mobile |

---

## Architecture Summary

```
The Third Eye
├── frontend/          Next.js 14 App Router + Tailwind + Radix UI
│   ├── app/           Pages + API routes
│   ├── components/    UI + feature components
│   │   ├── studio/    StudioWorkbench, MusicStudio, StudioHub
│   │   ├── avatar/    VideoAvatar (canvas + MediaRecorder + TTS)
│   │   ├── layout/    Sidebar, MainLayout
│   │   └── ...
│   ├── lib/           studioTools, studioGenerate, musicVideo, ...
│   └── hooks/         useMode, useAgentProfile, useModeTags
├── backend/           FastAPI + SQLAlchemy + pgvector
├── supabase/          Database migrations
└── docs/              This document
```

---

*Document generated by Buffy (Freebuff AI Assistant) — July 27, 2026*
