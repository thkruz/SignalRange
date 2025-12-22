# Supabase Database Schema Documentation

**Project Reference:** `ucukugprniwigzqnqpuz`
**URL:** `https://ucukugprniwigzqnqpuz.supabase.co`
**Last Updated:** 2025-12-22

## Overview

SignalRange shares a Supabase backend with KeepTrack. The database now uses **app-scoped normalized tables** for data isolation and granular updates, replacing the previous JSONB-based approach.

### Key Design Principles

1. **App Isolation** - Each app has its own data via `app_id` column
2. **Granular Updates** - Per-scenario tables instead of monolithic JSONB
3. **Separated Checkpoints** - Large AppState blobs in dedicated table

---

## New Tables (App-Scoped)

### `public.apps`

Registry of applications sharing this backend.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | text | **PK** | App identifier ('signalrange', 'keeptrack') |
| name | text | NOT NULL | Display name |
| description | text | - | App description |
| created_at | timestamptz | DEFAULT now() | Creation time |

---

### `public.scenario_progress`

Per-scenario progress tracking. **One row per user + app + scenario.**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL | User reference |
| app_id | text | **FK → apps.id**, NOT NULL | App reference |
| scenario_id | text | NOT NULL | Scenario identifier |
| scenario_number | integer | - | Legacy numeric ID |
| completed_objectives | integer[] | DEFAULT '{}' | Objective indices completed |
| score | integer | DEFAULT 0 | Total score |
| base_points | integer | DEFAULT 0 | Points from objectives |
| time_bonus | integer | DEFAULT 0 | Bonus from remaining time |
| quiz_penalties | integer | DEFAULT 0 | Deductions from wrong answers |
| completed_at | timestamptz | - | Completion timestamp |
| last_played | timestamptz | DEFAULT now() | Last play timestamp |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Unique Constraint:** `(user_id, app_id, scenario_id)`

**Indexes:**
- `scenario_progress_user_app_idx` (user_id, app_id)
- `scenario_progress_user_scenario_idx` (user_id, scenario_id)

---

### `public.checkpoints`

Stores full AppState blobs for scenario resume functionality.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL | User reference |
| app_id | text | **FK → apps.id**, NOT NULL | App reference |
| scenario_id | text | NOT NULL | Scenario identifier |
| version | text | NOT NULL | App version when saved |
| state | jsonb | NOT NULL | Full AppState snapshot |
| saved_at | timestamptz | DEFAULT now() | Save timestamp |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Unique Constraint:** `(user_id, app_id, scenario_id)` - One checkpoint per scenario

**Indexes:**
- `checkpoints_user_app_idx` (user_id, app_id)
- `checkpoints_user_scenario_idx` (user_id, scenario_id)

---

### `public.app_preferences`

Per-app user preferences.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL | User reference |
| app_id | text | **FK → apps.id**, NOT NULL | App reference |
| preferences | jsonb | DEFAULT '{}' | Preferences object |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Unique Constraint:** `(user_id, app_id)`

---

### `public.user_app_summary`

Aggregated stats per user per app.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL | User reference |
| app_id | text | **FK → apps.id**, NOT NULL | App reference |
| total_score | integer | DEFAULT 0 | Sum of all scenario scores |
| completed_scenario_count | integer | DEFAULT 0 | Number of completed scenarios |
| last_played_scenario | text | - | Most recent scenario ID |
| created_at | timestamptz | DEFAULT now() | Creation time |
| updated_at | timestamptz | DEFAULT now() | Last update |

**Unique Constraint:** `(user_id, app_id)`

---

## Shared Tables

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
| app_id | text | **FK → apps.id** | App-specific (NULL = shared) |
| created_at | timestamptz | DEFAULT now() | Creation time |

---

### `public.user_achievements`

Junction table for user-achievement relationships.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | **PK**, DEFAULT gen_random_uuid() | Row identifier |
| user_id | uuid | **FK → users.id**, NOT NULL | User who earned it |
| achievement_id | integer | **FK → achievements.id**, NOT NULL | Achievement earned |
| app_id | text | **FK → apps.id** | App context |
| unlocked_at | timestamptz | DEFAULT now() | When earned |

**Unique Constraint:** `(user_id, achievement_id)`

---

## Deprecated Tables

> **Note:** These tables are deprecated but may still contain data. New code should use the app-scoped tables above.

### `public.user_preferences` (deprecated)

Use `app_preferences` instead for per-app settings.

### `public.user_progress` (deprecated)

Use `scenario_progress` and `checkpoints` tables instead.

### `public.user_data` (deprecated)

Use `user_app_summary` for aggregated stats.

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
│  public.users   │       │  apps            │
│─────────────────│       │──────────────────│
│ id (PK)         │       │ id (PK)          │
│ email           │       │ name             │
│ display_name    │       │ description      │
│ avatar_url      │       └────────┬─────────┘
└────────┬────────┘                │
         │                         │
    ┌────┴────────┬────────────────┼──────────────┐
    │             │                │              │
    ▼             ▼                ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐
│ scenario │ │ check-   │ │ app_         │ │ user_app_  │
│ progress │ │ points   │ │ preferences  │ │ summary    │
│──────────│ │──────────│ │──────────────│ │────────────│
│ id       │ │ id       │ │ id           │ │ id         │
│ user_id  │ │ user_id  │ │ user_id      │ │ user_id    │
│ app_id   │ │ app_id   │ │ app_id       │ │ app_id     │
│ scen_id  │ │ scen_id  │ │ preferences  │ │ total_score│
│ score    │ │ state    │ └──────────────┘ └────────────┘
│ ...      │ │ ...      │
└──────────┘ └──────────┘

         ┌───────────────┐    ┌───────────────┐
         │ achievements  │────│ user_         │
         │───────────────│    │ achievements  │
         │ id (PK)       │    │───────────────│
         │ name          │    │ user_id (FK)  │
         │ app_id (FK)   │    │ achiev_id(FK) │
         │ points        │    │ app_id (FK)   │
         └───────────────┘    └───────────────┘
```

---

## API Endpoints

### New App-Scoped Endpoints

```
GET    /api/user/apps/:appId/scenarios/progress          # Batch load all
GET    /api/user/apps/:appId/scenarios/:id/progress      # Single scenario
PUT    /api/user/apps/:appId/scenarios/:id/progress      # Update scenario

GET    /api/user/apps/:appId/scenarios/:id/checkpoint    # Load checkpoint
PUT    /api/user/apps/:appId/scenarios/:id/checkpoint    # Save checkpoint
DELETE /api/user/apps/:appId/scenarios/:id/checkpoint    # Clear checkpoint
HEAD   /api/user/apps/:appId/scenarios/:id/checkpoint    # Check exists

GET    /api/user/apps/:appId/preferences                 # App preferences
PUT    /api/user/apps/:appId/preferences

GET    /api/user/apps/:appId/summary                     # Aggregated stats
GET    /api/user/apps/:appId/full-data                   # Full user data
```

### Legacy Endpoints (deprecated)

```
GET/PUT  /api/user/progress      # Use scenario-specific endpoints
GET/PUT  /api/user/preferences   # Use app-scoped preferences
```

---

## TypeScript Types

See [src/user-account/types.ts](../src/user-account/types.ts) for complete type definitions:

**New Types:**
- `AppId` - App identifier type
- `ScenarioProgress` - Per-scenario progress (normalized)
- `Checkpoint` - AppState snapshot
- `AppPreferences` - Per-app preferences
- `UserAppSummary` - Aggregated stats
- `ScenariosProgressResponse` - Batch response
- `FullAppUserData` - Complete app-scoped data

**Deprecated Types:**
- `UserProgressData` - Use `ScenarioProgress` instead
- `ScenarioProgressEntry` - Use `ScenarioProgress` instead
- `UserProgress` - Use normalized tables

---

## Migration

To apply the new schema, run the SQL in [schema-migration.sql](./schema-migration.sql).

---

## Notes

1. **App Isolation:** All new tables include `app_id` to prevent cross-app data corruption.

2. **Granular Updates:** Saving a scenario only updates that scenario's row, not the entire progress blob.

3. **Checkpoint Separation:** Large AppState data is stored in a dedicated table, keeping core progress data lean.

4. **Backward Compatibility:** Legacy endpoints still work during transition but are deprecated.

5. **Shared Backend:** This database is shared with KeepTrack. The new schema ensures both apps can coexist safely.
