-- ═══════════════════════════════════════════════════════════════════════════
--  HUNTIK — Supabase Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Enable UUID extension ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE: profiles
--  One row per user. Links to Supabase Auth (auth.users).
--  Stores role (admin/player) and display name.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username      TEXT UNIQUE NOT NULL,          -- login name shown to user
    display_name  TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE: characters
--  One row per player. Full character sheet as JSONB.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.characters (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    data          JSONB NOT NULL DEFAULT '{}',   -- full character object
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE: titans
--  Separate table so admin can see titan collections without loading character
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.titans (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    data          JSONB NOT NULL DEFAULT '[]',   -- array of titan objects
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE: admin_lists
--  Single row containing all GM-managed lists (materials, feats, etc.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.admin_lists (
    id            INT PRIMARY KEY DEFAULT 1,     -- always 1, single row
    data          JSONB NOT NULL DEFAULT '{}',
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert empty row on first setup
INSERT INTO public.admin_lists (id, data) VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
--  TABLE: rooms  (for future real-time sessions)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rooms (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code          TEXT UNIQUE NOT NULL,
    created_by    UUID REFERENCES public.profiles(id),
    state         JSONB NOT NULL DEFAULT '{}',   -- map, tokens, initiative, chat
    active        BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  AUTO-UPDATE updated_at
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_characters_updated_at BEFORE UPDATE ON public.characters
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_titans_updated_at BEFORE UPDATE ON public.titans
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_admin_lists_updated_at BEFORE UPDATE ON public.admin_lists
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
--  AUTO-CREATE profile + character + titans rows when a new user signs up
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'player')
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.characters (user_id, data)
    VALUES (NEW.id, '{}')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.titans (user_id, data)
    VALUES (NEW.id, '[]')
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
--  Players can only read/write their own data.
--  Admins can read/write everyone's data.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms       ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE POLICY "profiles: own read"
    ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles: own update"
    ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles: admin insert"
    ON public.profiles FOR INSERT WITH CHECK (public.is_admin() OR id = auth.uid());

-- ─── characters ──────────────────────────────────────────────────────────────
CREATE POLICY "characters: own read"
    ON public.characters FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "characters: own write"
    ON public.characters FOR ALL USING (user_id = auth.uid() OR public.is_admin());

-- ─── titans ──────────────────────────────────────────────────────────────────
CREATE POLICY "titans: own read"
    ON public.titans FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "titans: own write"
    ON public.titans FOR ALL USING (user_id = auth.uid() OR public.is_admin());

-- ─── admin_lists ─────────────────────────────────────────────────────────────
CREATE POLICY "lists: all read"
    ON public.admin_lists FOR SELECT USING (TRUE);  -- everyone can read lists

CREATE POLICY "lists: admin write"
    ON public.admin_lists FOR ALL USING (public.is_admin());

-- ─── rooms ───────────────────────────────────────────────────────────────────
CREATE POLICY "rooms: authenticated read"
    ON public.rooms FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "rooms: admin write"
    ON public.rooms FOR ALL USING (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
--  ADMIN FUNCTION: Create a new player account
--  Called server-side via service_role key — never exposed client-side
-- ═══════════════════════════════════════════════════════════════════════════
-- (Account creation is handled via Supabase Admin API in supabase.js)
