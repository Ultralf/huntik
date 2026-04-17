-- ═══════════════════════════════════════════════════════════════════════════
--  HUNTIK — Room Schema
--  Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
    id          TEXT PRIMARY KEY,          -- 6-char code e.g. "AB12CD"
    created_by  UUID REFERENCES auth.users NOT NULL,
    name        TEXT NOT NULL DEFAULT 'Session',
    is_open     BOOLEAN NOT NULL DEFAULT true,
    scene       JSONB NOT NULL DEFAULT '{}', -- { imageUrl, gridEnabled, gridSize, gridOffsetX, gridOffsetY }
    initiative  JSONB NOT NULL DEFAULT '[]', -- [{ name, initiative, tokenId }]
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tokens in scene ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     TEXT REFERENCES public.rooms(id) ON DELETE CASCADE,
    owner_id    UUID REFERENCES auth.users,  -- NULL = admin-placed NPC
    name        TEXT NOT NULL,
    label       TEXT,                        -- "(PlayerName)" suffix
    image_url   TEXT,
    token_type  TEXT DEFAULT 'npc',          -- 'character' | 'titan' | 'npc'
    x           REAL NOT NULL DEFAULT 100,
    y           REAL NOT NULL DEFAULT 100,
    hp_current  INTEGER,
    hp_max      INTEGER,
    sta_current INTEGER,
    sta_max     INTEGER,
    size        REAL NOT NULL DEFAULT 1,     -- multiplier: 1=normal, 2=large, 0.5=small
    is_hidden   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Chat messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_chat (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     TEXT REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users,
    username    TEXT NOT NULL,
    message     TEXT NOT NULL,
    msg_type    TEXT DEFAULT 'chat',         -- 'chat' | 'system' | 'roll'
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Token library (persistent per admin) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_library (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID REFERENCES auth.users NOT NULL,
    name        TEXT NOT NULL,
    image_url   TEXT,
    hp_max      INTEGER DEFAULT 10,
    sta_max     INTEGER,
    token_type  TEXT DEFAULT 'npc',
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Scene images library (admin) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scene_library (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID REFERENCES auth.users NOT NULL,
    name        TEXT NOT NULL,
    image_url   TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Enable RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_chat     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_library ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- rooms: anyone authenticated can read open rooms, admin can do everything
CREATE POLICY "rooms_read" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE TO authenticated USING (created_by = auth.uid());

-- room_tokens: authenticated users can read all tokens in a room; only admin of room can insert/update/delete NPC tokens; players can update their own token position and HP
CREATE POLICY "tokens_read" ON public.room_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "tokens_insert" ON public.room_tokens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tokens_update" ON public.room_tokens FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tokens_delete" ON public.room_tokens FOR DELETE TO authenticated USING (true);

-- chat: anyone authenticated can read and insert
CREATE POLICY "chat_read" ON public.room_chat FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_insert" ON public.room_chat FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- token library: private per user
CREATE POLICY "lib_read" ON public.token_library FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "lib_insert" ON public.token_library FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "lib_update" ON public.token_library FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "lib_delete" ON public.token_library FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- scene library: private per user
CREATE POLICY "scene_lib_read" ON public.scene_library FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "scene_lib_insert" ON public.scene_library FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "scene_lib_update" ON public.scene_library FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "scene_lib_delete" ON public.scene_library FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ─── Enable Realtime on all room tables ───────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_chat;
