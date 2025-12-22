-- ============================================================================
-- SignalRange/KeepTrack Schema Redesign
-- Run this SQL in Supabase SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. App Registry Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed app data
INSERT INTO public.apps (id, name, description) VALUES
    ('signalrange', 'SignalRange', 'RF signal training simulator'),
    ('keeptrack', 'KeepTrack', 'Satellite tracking application')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Per-Scenario Progress Table (replaces user_progress.progress JSONB)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL REFERENCES public.apps(id),
    scenario_id TEXT NOT NULL,
    scenario_number INTEGER,

    completed_objectives INTEGER[] DEFAULT '{}',
    score INTEGER DEFAULT 0,
    base_points INTEGER DEFAULT 0,
    time_bonus INTEGER DEFAULT 0,
    quiz_penalties INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ,
    last_played TIMESTAMPTZ DEFAULT now(),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, app_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS scenario_progress_user_app_idx
    ON public.scenario_progress(user_id, app_id);
CREATE INDEX IF NOT EXISTS scenario_progress_user_scenario_idx
    ON public.scenario_progress(user_id, scenario_id);

-- ----------------------------------------------------------------------------
-- 3. Checkpoints Table (replaces user_progress.progress.signalForge array)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL REFERENCES public.apps(id),
    scenario_id TEXT NOT NULL,

    version TEXT NOT NULL,
    state JSONB NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT now(),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, app_id, scenario_id)
);

CREATE INDEX IF NOT EXISTS checkpoints_user_app_idx
    ON public.checkpoints(user_id, app_id);
CREATE INDEX IF NOT EXISTS checkpoints_user_scenario_idx
    ON public.checkpoints(user_id, scenario_id);

-- ----------------------------------------------------------------------------
-- 4. Per-App Preferences Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL REFERENCES public.apps(id),
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, app_id)
);

CREATE INDEX IF NOT EXISTS app_preferences_user_app_idx
    ON public.app_preferences(user_id, app_id);

-- ----------------------------------------------------------------------------
-- 5. User App Summary Table (aggregated stats)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_app_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL REFERENCES public.apps(id),

    total_score INTEGER DEFAULT 0,
    completed_scenario_count INTEGER DEFAULT 0,
    last_played_scenario TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, app_id)
);

CREATE INDEX IF NOT EXISTS user_app_summary_user_app_idx
    ON public.user_app_summary(user_id, app_id);

-- ----------------------------------------------------------------------------
-- 6. Modify Existing Tables - Add app_id columns
-- ----------------------------------------------------------------------------

-- Add app_id to achievements (NULL = shared across all apps)
ALTER TABLE public.achievements
    ADD COLUMN IF NOT EXISTS app_id TEXT REFERENCES public.apps(id);

-- Add app_id to user_achievements
ALTER TABLE public.user_achievements
    ADD COLUMN IF NOT EXISTS app_id TEXT REFERENCES public.apps(id);

-- ----------------------------------------------------------------------------
-- 7. Row Level Security Policies
-- ----------------------------------------------------------------------------

-- scenario_progress RLS
ALTER TABLE public.scenario_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scenario progress" ON public.scenario_progress;
CREATE POLICY "Users can view own scenario progress"
    ON public.scenario_progress FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own scenario progress" ON public.scenario_progress;
CREATE POLICY "Users can insert own scenario progress"
    ON public.scenario_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own scenario progress" ON public.scenario_progress;
CREATE POLICY "Users can update own scenario progress"
    ON public.scenario_progress FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own scenario progress" ON public.scenario_progress;
CREATE POLICY "Users can delete own scenario progress"
    ON public.scenario_progress FOR DELETE
    USING (auth.uid() = user_id);

-- checkpoints RLS
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own checkpoints" ON public.checkpoints;
CREATE POLICY "Users can view own checkpoints"
    ON public.checkpoints FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own checkpoints" ON public.checkpoints;
CREATE POLICY "Users can insert own checkpoints"
    ON public.checkpoints FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own checkpoints" ON public.checkpoints;
CREATE POLICY "Users can update own checkpoints"
    ON public.checkpoints FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own checkpoints" ON public.checkpoints;
CREATE POLICY "Users can delete own checkpoints"
    ON public.checkpoints FOR DELETE
    USING (auth.uid() = user_id);

-- app_preferences RLS
ALTER TABLE public.app_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own app preferences" ON public.app_preferences;
CREATE POLICY "Users can view own app preferences"
    ON public.app_preferences FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own app preferences" ON public.app_preferences;
CREATE POLICY "Users can manage own app preferences"
    ON public.app_preferences FOR ALL
    USING (auth.uid() = user_id);

-- user_app_summary RLS
ALTER TABLE public.user_app_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own app summary" ON public.user_app_summary;
CREATE POLICY "Users can view own app summary"
    ON public.user_app_summary FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own app summary" ON public.user_app_summary;
CREATE POLICY "Users can manage own app summary"
    ON public.user_app_summary FOR ALL
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 8. updated_at Trigger Function (if not exists)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to new tables
DROP TRIGGER IF EXISTS update_scenario_progress_updated_at ON public.scenario_progress;
CREATE TRIGGER update_scenario_progress_updated_at
    BEFORE UPDATE ON public.scenario_progress
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_checkpoints_updated_at ON public.checkpoints;
CREATE TRIGGER update_checkpoints_updated_at
    BEFORE UPDATE ON public.checkpoints
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_preferences_updated_at ON public.app_preferences;
CREATE TRIGGER update_app_preferences_updated_at
    BEFORE UPDATE ON public.app_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_app_summary_updated_at ON public.user_app_summary;
CREATE TRIGGER update_user_app_summary_updated_at
    BEFORE UPDATE ON public.user_app_summary
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
