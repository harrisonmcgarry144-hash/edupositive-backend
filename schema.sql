-- EduPositive — PostgreSQL Schema
-- Run: psql $DATABASE_URL -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  username        VARCHAR(50)  UNIQUE NOT NULL,
  full_name       VARCHAR(100),
  avatar_url      TEXT,
  bio             TEXT,
  role            VARCHAR(20)  DEFAULT 'user' CHECK (role IN ('user','admin','tutor')),
  level_type      VARCHAR(10)  CHECK (level_type IN ('gcse','a-level')),
  career_goal     VARCHAR(100),
  school          VARCHAR(200),
  is_public       BOOLEAN      DEFAULT true,
  is_verified     BOOLEAN      DEFAULT false,
  verify_token    VARCHAR(64),
  verify_expires  TIMESTAMP,
  reset_token     VARCHAR(64),
  reset_expires   TIMESTAMP,
  xp              INTEGER      DEFAULT 0,
  level           INTEGER      DEFAULT 1,
  streak          INTEGER      DEFAULT 0,
  longest_streak  INTEGER      DEFAULT 0,
  last_active     DATE,
  grace_used      BOOLEAN      DEFAULT false,
  notify_streak   BOOLEAN      DEFAULT true,
  notify_weak     BOOLEAN      DEFAULT true,
  pomodoro_mins   INTEGER      DEFAULT 25,
  pomodoro_on     BOOLEAN      DEFAULT true,
  created_at      TIMESTAMP    DEFAULT NOW(),
  updated_at      TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subjects (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  subject_id  UUID,
  PRIMARY KEY (user_id, subject_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTENT HIERARCHY: Subject → Topic → Subtopic → Lesson
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  icon        VARCHAR(10),
  color       VARCHAR(7),
  level_type  VARCHAR(10),
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id  UUID REFERENCES subjects(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(200) NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(subject_id, slug)
);

CREATE TABLE IF NOT EXISTS subtopics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id    UUID REFERENCES topics(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(200) NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(topic_id, slug)
);

CREATE TABLE IF NOT EXISTS lessons (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subtopic_id  UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  title        VARCHAR(300) NOT NULL,
  content      TEXT NOT NULL,
  summary      TEXT,
  keywords     TEXT[]       DEFAULT '{}',
  version      INTEGER      DEFAULT 1,
  is_published BOOLEAN      DEFAULT false,
  created_by   UUID REFERENCES users(id),
  updated_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP    DEFAULT NOW(),
  updated_at   TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_versions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id  UUID REFERENCES lessons(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  version    INTEGER NOT NULL,
  edited_by  UUID REFERENCES users(id),
  edited_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_answers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id   UUID REFERENCES lessons(id) ON DELETE CASCADE,
  title       VARCHAR(300) NOT NULL,
  content     TEXT NOT NULL,
  grade       VARCHAR(5),
  marks       INTEGER,
  annotations TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- FLASHCARDS + SPACED REPETITION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  subject_id   UUID REFERENCES subjects(id),
  topic_id     UUID REFERENCES topics(id),
  is_public    BOOLEAN  DEFAULT false,
  is_official  BOOLEAN  DEFAULT false,
  rating       DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER  DEFAULT 0,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flashcards (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deck_id    UUID REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  hint       TEXT,
  tags       TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flashcard_progress (
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  flashcard_id    UUID REFERENCES flashcards(id) ON DELETE CASCADE,
  ease_factor     DECIMAL(4,2) DEFAULT 2.5,
  interval_days   INTEGER      DEFAULT 1,
  repetitions     INTEGER      DEFAULT 0,
  next_review     DATE         DEFAULT CURRENT_DATE,
  last_reviewed   TIMESTAMP,
  correct_count   INTEGER      DEFAULT 0,
  incorrect_count INTEGER      DEFAULT 0,
  PRIMARY KEY (user_id, flashcard_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMS & PAST PAPERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_boards (
  id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO exam_boards (name) VALUES ('AQA'),('OCR'),('Edexcel'),('WJEC'),('CIE')
  ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS past_papers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id      UUID REFERENCES subjects(id),
  exam_board_id   UUID REFERENCES exam_boards(id),
  year            INTEGER NOT NULL,
  paper_number    INTEGER NOT NULL,
  title           VARCHAR(300),
  total_marks     INTEGER,
  duration_mins   INTEGER,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id        UUID REFERENCES past_papers(id) ON DELETE CASCADE,
  topic_id        UUID REFERENCES topics(id),
  subtopic_id     UUID REFERENCES subtopics(id),
  question_text   TEXT NOT NULL,
  question_number VARCHAR(10),
  marks           INTEGER NOT NULL,
  difficulty      VARCHAR(10) CHECK (difficulty IN ('easy','medium','hard')),
  mark_scheme     TEXT,
  model_answer    TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grade_boundaries (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id  UUID REFERENCES past_papers(id) ON DELETE CASCADE,
  grade     VARCHAR(5) NOT NULL,
  min_marks INTEGER    NOT NULL,
  max_marks INTEGER    NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  paper_id        UUID REFERENCES past_papers(id),
  started_at      TIMESTAMP DEFAULT NOW(),
  submitted_at    TIMESTAMP,
  total_score     INTEGER,
  grade_achieved  VARCHAR(5),
  time_taken_secs INTEGER,
  mode            VARCHAR(20) DEFAULT 'practice' CHECK (mode IN ('practice','timed','strict'))
);

CREATE TABLE IF NOT EXISTS exam_answers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id    UUID REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id   UUID REFERENCES exam_questions(id),
  answer_text   TEXT,
  marks_awarded INTEGER,
  ai_feedback   JSONB,
  ai_marked_at  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_exams (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id),
  paper_name    VARCHAR(200),
  exam_date     DATE NOT NULL,
  duration_mins INTEGER,
  board         VARCHAR(50),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MEMORY & RECALL SYSTEM
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_strength (
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id     UUID REFERENCES subtopics(id) ON DELETE CASCADE,
  score           DECIMAL(5,2) DEFAULT 0,
  flashcard_score DECIMAL(5,2) DEFAULT 0,
  recall_score    DECIMAL(5,2) DEFAULT 0,
  blurt_score     DECIMAL(5,2) DEFAULT 0,
  exam_score      DECIMAL(5,2) DEFAULT 0,
  updated_at      TIMESTAMP    DEFAULT NOW(),
  PRIMARY KEY (user_id, subtopic_id)
);

CREATE TABLE IF NOT EXISTS blurt_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id UUID REFERENCES subtopics(id),
  user_text   TEXT NOT NULL,
  ai_feedback JSONB,
  score       INTEGER,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feynman_sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id         UUID REFERENCES subtopics(id),
  user_explanation    TEXT NOT NULL,
  ai_evaluation       JSONB,
  understanding_level VARCHAR(20),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AI CHAT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id    UUID REFERENCES topics(id),
  mode        VARCHAR(20) DEFAULT 'normal',
  personality VARCHAR(20) DEFAULT 'friendly',
  created_at  TIMESTAMP   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(10) CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  tokens_used INTEGER,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- GAMIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     VARCHAR(100),
  ref_id     UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         VARCHAR(50) UNIQUE NOT NULL,
  title       VARCHAR(100) NOT NULL,
  description TEXT,
  icon        VARCHAR(10),
  xp_reward   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES achievements(id),
  earned_at      TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  duration_mins INTEGER NOT NULL,
  completed     BOOLEAN   DEFAULT false,
  context_type  VARCHAR(20),
  context_id    UUID,
  started_at    TIMESTAMP DEFAULT NOW(),
  ended_at      TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STUDY SCHEDULE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_schedule (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id    UUID REFERENCES subtopics(id),
  scheduled_date DATE NOT NULL,
  duration_mins  INTEGER,
  priority       INTEGER   DEFAULT 5,
  completed      BOOLEAN   DEFAULT false,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester  UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver   UUID REFERENCES users(id) ON DELETE CASCADE,
  status     VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (requester, receiver)
);

CREATE TABLE IF NOT EXISTS study_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  creator_id  UUID REFERENCES users(id),
  is_public   BOOLEAN   DEFAULT true,
  school      VARCHAR(200),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  UUID REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  role      VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read        BOOLEAN   DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_id   UUID REFERENCES topics(id),
  title      VARCHAR(300),
  content    TEXT NOT NULL,
  parent_id  UUID REFERENCES forum_posts(id),
  upvotes    INTEGER   DEFAULT 0,
  is_flagged BOOLEAN   DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_upvotes (
  post_id    UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPETITIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deck_id          UUID REFERENCES flashcard_decks(id),
  challenger_id    UUID REFERENCES users(id),
  opponent_id      UUID REFERENCES users(id),
  status           VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','active','complete')),
  challenger_score INTEGER,
  opponent_score   INTEGER,
  winner_id        UUID REFERENCES users(id),
  created_at       TIMESTAMP DEFAULT NOW(),
  completed_at     TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TUTORING MARKETPLACE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_profiles (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  bio            TEXT,
  qualifications TEXT[]       DEFAULT '{}',
  subject_ids    UUID[]       DEFAULT '{}',
  hourly_rate    DECIMAL(6,2),
  rating         DECIMAL(3,2) DEFAULT 0,
  rating_count   INTEGER      DEFAULT 0,
  is_verified    BOOLEAN      DEFAULT false,
  is_active      BOOLEAN      DEFAULT true,
  created_at     TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tutor_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id       UUID REFERENCES tutor_profiles(id),
  student_id     UUID REFERENCES users(id),
  scheduled_at   TIMESTAMP NOT NULL,
  duration_mins  INTEGER   DEFAULT 60,
  price          DECIMAL(6,2),
  status         VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  meeting_url    TEXT,
  notes          TEXT,
  student_rating INTEGER CHECK (student_rating BETWEEN 1 AND 5),
  student_review TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tutor_availability (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id    UUID REFERENCES tutor_profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  title      VARCHAR(200),
  body       TEXT,
  data       JSONB,
  read       BOOLEAN   DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_school      ON users(school);
CREATE INDEX IF NOT EXISTS idx_lessons_subtopic  ON lessons(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_fp_review         ON flashcard_progress(user_id, next_review);
CREATE INDEX IF NOT EXISTS idx_ea_attempt        ON exam_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_mem_user          ON memory_strength(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_session      ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_xp_user           ON xp_events(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_conv           ON direct_messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_sched_user        ON study_schedule(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_forum_topic       ON forum_posts(topic_id);
