# ✦ EduPositive — Backend API

Complete, production-ready Node.js/Express backend for EduPositive.

---

## Quick Start (5 steps)

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Open .env and fill in each value (see notes below)
```

### 3. Create the database
```bash
# Make sure PostgreSQL is running, then:
createdb edupositive
npm run db:setup
```

### 4. Set Harrison's account as admin
After first registering with `harrisonmcgarry144@gmail.com`, run:
```bash
psql $DATABASE_URL -c "UPDATE users SET role='admin' WHERE email='harrisonmcgarry144@gmail.com';"
```

### 5. Start the server
```bash
npm run dev     # development (auto-restarts on save)
npm start       # production
```

Server runs at **http://localhost:5000**
Health check: **http://localhost:5000/api/health**

---

## Environment Variables

| Variable | Where to get it |
|----------|----------------|
| `DATABASE_URL` | Your PostgreSQL host (Render, Railway, Supabase, or local) |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `SMTP_USER` / `SMTP_PASS` | Gmail + App Password at myaccount.google.com/apppasswords |
| `CLOUDINARY_*` | Free account at cloudinary.com (needed for avatars + handwriting) |

---

## Project Structure

```
edupositive/
├── server.js                    ← Entry point
├── db/
│   ├── index.js                 ← PostgreSQL connection pool
│   └── schema.sql               ← All tables, indexes, constraints
├── middleware/
│   └── auth.js                  ← JWT verify, role guards
├── routes/
│   ├── auth.js                  ← Register, login, verify, reset, onboarding
│   ├── users.js                 ← Profile, schedule, notifications
│   ├── content.js               ← Lessons, topics, subjects (admin write / user read)
│   ├── flashcards.js            ← Decks, cards, SM-2 spaced repetition, competitions
│   ├── ai.js                    ← Chat, marking, blurting, Feynman, flashcard gen
│   ├── exams.js                 ← Past papers, attempts, schedule, grade boundaries
│   ├── analytics.js             ← Dashboard, memory, XP history, target grade
│   ├── gamification.js          ← Leaderboard, achievements, pomodoro
│   ├── social.js                ← Friends, DMs, groups, forum
│   ├── tutors.js                ← Marketplace, booking, reviews
│   ├── upload.js                ← Avatar upload, handwriting OCR
│   └── admin.js                 ← Full editorial control (admin only)
├── services/
│   ├── gamification.js          ← XP, levelling, achievement unlocking
│   ├── scheduler.js             ← Auto study schedule generation
│   ├── notifications.js         ← Cron job handlers + notification creator
│   └── email.js                 ← All transactional emails
└── sockets/
    └── realtime.js              ← Socket.IO (DMs, group chat, competitions, presence)
```

---

## Full API Reference

### Auth  `/api/auth`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | — | Create account, sends verification email |
| POST | `/login` | — | Sign in, returns JWT |
| GET | `/verify/:token` | — | Verify email address |
| POST | `/forgot-password` | — | Request password reset email |
| POST | `/reset-password` | — | Reset with token |
| POST | `/onboarding` | ✓ | Set level type, subjects, career goal |
| GET | `/me` | ✓ | Get own full profile |

### Users  `/api/users`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id` | Get public profile |
| PUT | `/me` | Update own profile |
| PUT | `/me/subjects` | Update subject list |
| GET | `/me/schedule` | Today's study plan |
| POST | `/me/schedule/:id/complete` | Mark item complete |
| GET | `/me/notifications` | All notifications |
| PUT | `/me/notifications/:id/read` | Mark notification read |

### Content  `/api/content`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/subjects` | — | All subjects |
| GET | `/subjects/:id/topics` | — | Topics + subtopics tree |
| GET | `/subtopics/:id/lessons` | — | Lessons list |
| GET | `/lessons/:id` | — | Full lesson + model answers |
| GET | `/subtopics/:id/mindmap` | ✓ | Mind map data |
| POST | `/subjects` | 🔒 Admin | Create subject |
| POST | `/topics` | 🔒 Admin | Create topic |
| POST | `/subtopics` | 🔒 Admin | Create subtopic |
| POST | `/lessons` | 🔒 Admin | Create lesson |
| PUT | `/lessons/:id` | 🔒 Admin | Edit lesson (auto-saves version) |
| DELETE | `/lessons/:id` | 🔒 Admin | Delete lesson |
| GET | `/lessons/:id/versions` | 🔒 Admin | Version history |
| POST | `/model-answers` | 🔒 Admin | Add model answer |

### Flashcards  `/api/flashcards`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/decks` | User's decks (or public) |
| POST | `/decks` | Create deck |
| PUT | `/decks/:id` | Edit deck |
| DELETE | `/decks/:id` | Delete deck |
| GET | `/decks/:id/cards` | Cards in a deck |
| GET | `/due` | Cards due for review today (SM-2) |
| POST | `/cards` | Add card to deck |
| PUT | `/cards/:id` | Edit card |
| DELETE | `/cards/:id` | Delete card |
| POST | `/review` | Submit review result (SM-2 update) |
| POST | `/session-complete` | Award XP for completed session |
| POST | `/compete` | Challenge friend to competition |
| PUT | `/compete/:id/respond` | Accept/decline competition |

### AI  `/api/ai`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat` | AI tutor chat (mode + personality) |
| GET | `/sessions` | List chat sessions |
| GET | `/sessions/:id/messages` | Chat history |
| POST | `/mark` | AI marks exam answer against mark scheme |
| POST | `/blurt` | Blurting with gap analysis |
| POST | `/feynman` | Feynman technique evaluation |
| POST | `/generate-flashcards` | Auto-generate flashcards from content |
| GET | `/study-guidance` | Personalised study recommendations |

### Exams  `/api/exams`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards` | Exam boards |
| GET | `/papers` | Past papers (filterable) |
| GET | `/papers/:id` | Paper + grade boundaries |
| GET | `/papers/:id/questions` | Questions list |
| POST | `/attempts` | Start exam |
| POST | `/attempts/:id/answer` | Save one answer |
| POST | `/attempts/:id/submit` | Submit exam |
| GET | `/attempts` | User's attempt history |
| GET | `/attempts/:id` | Attempt + marked answers |
| GET | `/schedule` | User's exam dates |
| POST | `/schedule` | Add exam date (triggers schedule gen) |
| DELETE | `/schedule/:id` | Remove exam date |
| POST | `/papers` | 🔒 Admin: create paper |
| POST | `/questions` | 🔒 Admin: add question |
| POST | `/papers/:id/grade-boundaries` | 🔒 Admin: set boundaries |

### Analytics  `/api/analytics`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Full overview (memory, exams, XP, upcoming) |
| GET | `/memory` | Memory strength by subtopic |
| GET | `/xp-history` | XP earned per day (last 30 days) |
| POST | `/target-grade` | Grade roadmap calculation |
| GET | `/common-mistakes` | AI feedback patterns |
| GET | `/peers` | Anonymised platform insights |

### Gamification  `/api/gamification`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/leaderboard` | Global / friends / school rankings |
| GET | `/achievements` | All achievements + earned status |
| POST | `/pomodoro/start` | Start pomodoro session |
| POST | `/pomodoro/:id/complete` | Complete session (+25 XP) |
| GET | `/stats` | XP today, pomos this week |

### Social  `/api/social`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/search` | Search users by name/school |
| POST | `/friends/request` | Send friend request |
| PUT | `/friends/:id/respond` | Accept/block |
| GET | `/friends` | Friend list |
| GET | `/friends/pending` | Incoming requests |
| GET | `/messages` | Conversation list |
| GET | `/messages/:userId` | Message thread |
| POST | `/messages` | Send DM |
| GET | `/groups` | Study groups |
| POST | `/groups` | Create group |
| POST | `/groups/:id/join` | Join group |
| DELETE | `/groups/:id/leave` | Leave group |
| GET | `/forum` | Forum posts |
| GET | `/forum/:id/replies` | Replies to post |
| POST | `/forum` | New post or reply |
| POST | `/forum/:id/upvote` | Upvote post |
| POST | `/forum/:id/report` | Report post |

### Upload  `/api/upload`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/avatar` | Upload profile picture (multipart/form-data, field: `avatar`) |
| POST | `/handwriting` | Upload handwritten image → OCR + AI feedback |

### Tutors  `/api/tutors`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Browse tutors |
| GET | `/:id` | Tutor profile + availability + reviews |
| POST | `/profile` | Create/update tutor profile |
| POST | `/:id/availability` | Set weekly availability |
| POST | `/:id/book` | Book a session |
| PUT | `/sessions/:id/confirm` | Tutor confirms session |
| POST | `/sessions/:id/review` | Student leaves review |
| GET | `/my/sessions` | Tutor sees their sessions |
| PUT | `/:id/verify` | 🔒 Admin: verify tutor |

### Admin  `/api/admin`  *(admin only)*
| Endpoint | Description |
|----------|-------------|
| GET `/overview` | Platform-wide stats |
| GET `/users` | All users (searchable) |
| PUT `/users/:id/role` | Change user role |
| DELETE `/users/:id` | Delete user |
| GET `/content/all` | Full content tree |
| GET `/content/drafts` | Unpublished lessons |
| PUT `/content/lessons/bulk-publish` | Publish/unpublish many lessons |
| GET `/flashcards/official` | Official decks |
| PUT `/flashcards/decks/:id/official` | Toggle official status |
| POST `/notifications/broadcast` | Send notification to all/some users |
| GET `/forum/flagged` | Flagged posts |
| DELETE `/forum/:id` | Delete post |
| PUT `/forum/:id/unflag` | Clear flag |

---

## Deploying to Production

### Render (recommended — free tier)
1. Push code to a GitHub repo
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in the Render dashboard
6. Add a PostgreSQL database add-on
7. Run schema: connect to the DB and run `db/schema.sql`
8. Set admin: `UPDATE users SET role='admin' WHERE email='harrisonmcgarry144@gmail.com';`

### Railway
Same steps — Railway auto-detects Node and provisions Postgres with one click.

---

## Security Notes
- Passwords: bcrypt, 12 rounds
- JWTs: 7-day expiry, HS256
- Admin access: enforced server-side on every route — no client bypass possible
- Rate limiting: 300 req/15min global, 15 req/15min on auth, 30 req/min on AI
- SQL injection: all queries use parameterised statements
- Helmet.js: sets secure HTTP headers automatically
