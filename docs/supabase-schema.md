# Supabase Database Schema Documentation

**Project Reference:** `ucukugprniwigzqnqpuz`
**URL:** `https://ucukugprniwigzqnqpuz.supabase.co`
**Last Updated:** 2025-12-22

## Overview

SignalRange shares a Supabase backend with KeepTrack. The database uses JSONB columns for flexible data storage (preferences, progress, data) while maintaining relational integrity through foreign keys to the `users` table.

## Table Schemas

### `public.users`

Primary user identity table, linked to Supabase Auth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK** | Links to `auth.users.id` |
| email | text | NOT NULL, UNIQUE | User's email address |
| username | text | UNIQUE | Optional username |
| display_name | text | - | Display name shown in UI |
| avatar_url | text | - | Profile picture URL |
| created_at | timestamptz | DEFAULT now() | Account creation time |
| updated_at | timestamptz | DEFAULT now() | Last profile update |

**Indexes:**
- `users_pkey` (id) - Primary key
- `users_email_key` (email) - Unique constraint
- `users_email_idx` (email) - Query optimization
- `users_username_key` (username) - Unique constraint (unused)
- `users_username_idx` (username) - Query optimization (unused)

**Row Count:** ~212 users

---

### `public.user_preferences`

User settings and preferences stored as JSONB.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL, UNIQUE | One-to-one with users |
| preferences | jsonb | - | Preferences object |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**JSONB Structure (`preferences`):**
```typescript
interface UserPreferencesData {
  // Audio settings
  isSoundEnabled: boolean;
  soundVolume: number;          // 0-1

  // UI settings
  theme: 'dark' | 'light';
  autoSaveProgress: boolean;

  // Simulation settings
  defaultFrequencyUnits: 'Hz' | 'kHz' | 'MHz' | 'GHz';
  defaultPowerUnits: 'dBm' | 'W' | 'mW';
}
```

**Indexes:**
- `user_preferences_pkey` (id)
- `user_preferences_user_id_key` (user_id) - Unique
- `user_preferences_user_id_idx` (user_id) - Query optimization

---

### `public.user_progress`

Tracks scenario completion, scores, and SignalForge saves.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL, UNIQUE | One-to-one with users |
| progress | jsonb | - | Progress data object |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**JSONB Structure (`progress`):**
```typescript
interface UserProgressData {
  completedScenarios?: number[];      // Array of completed scenario IDs
  scenarioProgress?: {
    [scenarioId: number]: {
      completedObjectives: number[];  // Objective IDs completed
      score: number;                  // Total score for scenario
      basePoints?: number;            // Points from objectives
      timeBonus?: number;             // Bonus from remaining time
      quizPenalties?: number;         // Deductions from wrong answers
      completedAt?: string;           // ISO timestamp
      lastPlayed: string;             // ISO timestamp
    };
  };
  totalScore?: number;                // Cumulative score across all scenarios
  signalForge?: Array<{
    scenarioId: string;
    version: string;
    state: AppState;                  // Full app state snapshot
    savedAt: number;                  // Unix timestamp
  }>;
}
```

**Indexes:**
- `user_progress_pkey` (id)
- `user_progress_user_id_key` (user_id) - Unique
- `user_progress_user_id_idx` (user_id) - **Most used index** (4455 scans)

**Size:** 352 kB (largest table due to JSONB data)

---

### `public.user_data`

Miscellaneous user data (last played, favorites).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL, UNIQUE | One-to-one with users |
| data | jsonb | - | User data object |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**JSONB Structure (`data`):**
```typescript
interface UserDataData {
  lastPlayedScenario?: number | null;   // Most recent scenario ID
  favoriteScenarios?: number[];         // Bookmarked scenarios
}
```

**Indexes:**
- `user_data_pkey` (id)
- `user_data_user_id_key` (user_id) - Unique
- `user_data_user_id_idx` (user_id)

---

### `public.achievements`

Achievement definitions (shared with KeepTrack).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | integer | **PK** | Achievement identifier |
| name | text | NOT NULL, UNIQUE | Internal name/key |
| description | text | NOT NULL | User-facing description |
| icon_url | text | - | Achievement icon URL |
| points | integer | DEFAULT 0 | Point value |
| category | text | - | Achievement category |
| created_at | timestamptz | DEFAULT now() | Creation time |

**Row Count:** 5 achievements defined

---

### `public.user_achievements`

Junction table for user-achievement relationships.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL | User who earned it |
| achievement_id | integer | **FK → achievements.id**, NOT NULL | Achievement earned |
| unlocked_at | timestamptz | DEFAULT now() | When achievement was earned |

**Unique Constraint:** `(user_id, achievement_id)` - Prevents duplicate unlocks

**Indexes:**
- `user_achievements_pkey` (id)
- `user_achievements_user_id_achievement_id_key` - Composite unique
- `user_achievements_user_id_idx` (user_id)
- `user_achievements_achievement_id_idx` (achievement_id) - Unused

---

## Entity Relationship Diagram

```
┌─────────────────┐
│  auth.users     │
│  (Supabase)     │
└────────┬────────┘
         │ id
         ▼
┌─────────────────┐       ┌──────────────────┐
│  public.users   │       │  achievements    │
│─────────────────│       │──────────────────│
│ id (PK)         │       │ id (PK)          │
│ email           │       │ name             │
│ username        │       │ description      │
│ display_name    │       │ icon_url         │
│ avatar_url      │       │ points           │
│ created_at      │       │ category         │
│ updated_at      │       │ created_at       │
└────────┬────────┘       └────────┬─────────┘
         │                         │
    ┌────┴────┬──────────┬─────────┼─────────┐
    │         │          │         │         │
    ▼         ▼          ▼         ▼         │
┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┴───┐
│ user_  │ │ user_  │ │ user_  │ │ user_         │
│ prefs  │ │ prog   │ │ data   │ │ achievements  │
│────────│ │────────│ │────────│ │───────────────│
│ id     │ │ id     │ │ id     │ │ id            │
│ user_id│ │ user_id│ │ user_id│ │ user_id (FK)  │
│ prefs  │ │ prog   │ │ data   │ │ achiev_id(FK) │
│ (jsonb)│ │ (jsonb)│ │ (jsonb)│ │ unlocked_at   │
└────────┘ └────────┘ └────────┘ └───────────────┘
```

## Statistics (as of 2025-12-22)

| Table | Rows | Table Size | Index Size | Total Size |
|-------|------|------------|------------|------------|
| user_progress | 183 | 304 kB | 48 kB | 352 kB |
| users | 212 | 56 kB | 112 kB | 168 kB |
| user_preferences | 212 | 56 kB | 48 kB | 104 kB |
| user_data | 183 | 48 kB | 48 kB | 96 kB |
| user_achievements | 1 | 8 kB | 64 kB | 72 kB |
| achievements | 5 | 16 kB | 32 kB | 48 kB |

## API Access

### REST API
- **Base URL:** `https://ucukugprniwigzqnqpuz.supabase.co/rest/v1/`
- **Auth Header:** `apikey: <anon_key>` + `Authorization: Bearer <user_jwt>`

### User API Server (KeepTrack Shared)
- **Base URL:** `https://user.keeptrack.space`
- **Auth:** Bearer token (Supabase JWT)
- Used for CRUD operations on user data

## TypeScript Types

See [src/user-account/types.ts](../src/user-account/types.ts) for complete type definitions including:
- `User`, `UserPreferences`, `UserProgress`, `UserData`
- `Achievement`, `UserAchievement`
- `FullUserData` - Complete user data response
- API request/response types

## Notes

1. **JSONB Columns:** `preferences`, `progress`, and `data` columns use JSONB for flexibility. The TypeScript interfaces define the expected structure but the database allows any valid JSON.

2. **Unused Indexes:** `users_username_key`, `users_username_idx`, and `user_achievements_achievement_id_idx` show 0 scans - consider removing if username feature isn't used.

3. **Row Count Mismatch:** `users` has 212 rows but `user_progress`/`user_data` have 183 - some users may not have initialized their progress/data yet.

4. **Shared Backend:** This database is shared with KeepTrack. Changes may affect both applications.