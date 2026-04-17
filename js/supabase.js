// ═══════════════════════════════════════════════════════════════════════════
//  HUNTIK — Supabase Data Layer
//  Replaces all localStorage read/write for accounts, characters, and titans.
//  Lists still use localStorage as cache + Supabase as source of truth.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://tcbeioftrtxtbbwpkwvc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYmVpb2Z0cnR4dGJid3Brd3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzI1NjksImV4cCI6MjA5MTk0ODU2OX0.GOqVCqAwKiOm49D7HcmRj5b9x5zZQubHujs2C0SvtrE';

// Service role key — used ONLY for admin operations (creating users).
// In a production app this would be a server-side secret.
// Here it's acceptable because the admin page is protected by auth.
const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYmVpb2Z0cnR4dGJid3Brd3ZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM3MjU2OSwiZXhwIjoyMDkxOTQ4NTY5fQ.2Wuc1cIHSBC1NPPUATtOXztiFqfKTQiqugGki_g3uy8';

// ─── Supabase client (loaded via CDN in HTML) ─────────────────────────────────
const _sb  = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const _sbA = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE); // admin ops only

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function sbSignIn(email, password) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    // Fetch profile (role, username)
    const { data: profile, error: pe } = await _sb
        .from('profiles').select('*').eq('id', data.user.id).single();
    if (pe || !profile) return { ok: false, error: 'Profile not found.' };

    // Store session info in sessionStorage (same pattern as before)
    sessionStorage.setItem('huntik_session', JSON.stringify({
        username:    profile.username,
        role:        profile.role,
        displayName: profile.display_name || profile.username,
        userId:      data.user.id,
        email:       data.user.email,
    }));
    return { ok: true, role: profile.role };
}

async function sbSignOut() {
    await _sb.auth.signOut();
    sessionStorage.removeItem('huntik_session');
}

function getSession() {
    try { return JSON.parse(sessionStorage.getItem('huntik_session')); }
    catch { return null; }
}

function clearSession() {
    sessionStorage.removeItem('huntik_session');
    _sb.auth.signOut();
}

// Restore Supabase session on page load (keeps token fresh)
async function sbRestoreSession() {
    const { data } = await _sb.auth.getSession();
    if (!data.session) {
        sessionStorage.removeItem('huntik_session');
        return null;
    }
    return getSession();
}

// ─── Change own password ──────────────────────────────────────────────────────
async function sbChangePassword(newPassword) {
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    return !error;
}

// ─── Change own username (display in session) ─────────────────────────────────
async function sbChangeUsername(newUsername) {
    const session = getSession(); if (!session) return false;
    newUsername = newUsername.trim();
    if (newUsername.length < 3) return false;

    const { error } = await _sb.from('profiles')
        .update({ username: newUsername })
        .eq('id', session.userId);
    if (error) return false;

    session.username = newUsername;
    session.displayName = newUsername;
    sessionStorage.setItem('huntik_session', JSON.stringify(session));
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN — ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Create a new player account (admin only)
async function sbAdminCreateUser(email, password, username, displayName) {
    // Use Supabase admin client to create user
    const { data, error } = await _sbA.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName, role: 'player' },
    });

    if (error) return { ok: false, error: error.message };

    const userId = data.user.id;

    // Upsert profile row (trigger should handle it, but ensure it exists)
    await _sbA.from('profiles').upsert({
        id: userId, username, display_name: displayName, role: 'player'
    }, { onConflict: 'id' });

    // Ensure character + titans rows exist
    await _sbA.from('characters').upsert({ user_id: userId, data: {} }, { onConflict: 'user_id' });
    await _sbA.from('titans').upsert({ user_id: userId, data: [] }, { onConflict: 'user_id' });

    return { ok: true, userId };
}

// List all player profiles (admin)
async function sbAdminGetAllProfiles() {
    const { data, error } = await _sbA.from('profiles').select('*').order('username');
    if (error) return [];
    return data;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHARACTER DATA
// ═══════════════════════════════════════════════════════════════════════════

// In-memory cache exposed on window so character.js sync wrappers can read it
async function sbLoadCharacter() {
    const session = getSession(); if (!session) return null;
    const { data, error } = await _sb.from('characters')
        .select('data').eq('user_id', session.userId).single();
    if (error || !data) return null;
    const char = data.data && Object.keys(data.data).length ? data.data : null;
    window._characterCache = char;
    return char;
}

async function sbSaveCharacter(char) {
    const session = getSession(); if (!session) return;
    window._characterCache = JSON.parse(JSON.stringify(char));
    await _sb.from('characters')
        .upsert({ user_id: session.userId, data: char }, { onConflict: 'user_id' });
}

// Admin: load any player's character
async function loadCharacterByUsername(username) {
    const { data: profile } = await _sbA.from('profiles')
        .select('id').eq('username', username).single();
    if (!profile) return null;
    const { data } = await _sbA.from('characters')
        .select('data').eq('user_id', profile.id).single();
    return data?.data && Object.keys(data.data).length ? data.data : null;
}

// Admin: save any player's character
async function saveCharacterForUser(username, char) {
    const { data: profile } = await _sbA.from('profiles')
        .select('id').eq('username', username).single();
    if (!profile) return;
    await _sbA.from('characters')
        .upsert({ user_id: profile.id, data: char }, { onConflict: 'user_id' });
}

// ═══════════════════════════════════════════════════════════════════════════
//  TITANS DATA
// ═══════════════════════════════════════════════════════════════════════════

async function sbLoadTitans() {
    const session = getSession(); if (!session) return [];
    const { data, error } = await _sb.from('titans')
        .select('data').eq('user_id', session.userId).single();
    if (error || !data) return [];
    const titans = Array.isArray(data.data) ? data.data : [];
    window._titansCache = titans;
    return titans;
}

async function sbSaveTitans(titans) {
    const session = getSession(); if (!session) return;
    window._titansCache = JSON.parse(JSON.stringify(titans));
    await _sb.from('titans')
        .upsert({ user_id: session.userId, data: titans }, { onConflict: 'user_id' });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN LISTS
// ═══════════════════════════════════════════════════════════════════════════

let _listsCache = null;

async function sbLoadLists() {
    if (_listsCache) return JSON.parse(JSON.stringify(_listsCache));
    const { data, error } = await _sb.from('admin_lists')
        .select('data').eq('id', 1).single();
    if (error || !data || !Object.keys(data.data).length) return null;
    _listsCache = data.data;
    return JSON.parse(JSON.stringify(_listsCache));
}

async function sbSaveLists(lists) {
    _listsCache = JSON.parse(JSON.stringify(lists));
    await _sb.from('admin_lists')
        .upsert({ id: 1, data: lists }, { onConflict: 'id' });
}

function invalidateListsCache() { _listsCache = null; }

// ═══════════════════════════════════════════════════════════════════════════
//  IMAGE STORAGE  (Supabase Storage bucket: "images")
//  Falls back to base64 in JSONB if storage upload fails.
// ═══════════════════════════════════════════════════════════════════════════

async function sbUploadImage(dataUrl, path) {
    // Convert base64 data URL to Blob
    try {
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        const { data, error } = await _sb.storage
            .from('images').upload(path, blob, { upsert: true, contentType: blob.type });
        if (error) return null;
        const { data: urlData } = _sb.storage.from('images').getPublicUrl(path);
        return urlData.publicUrl;
    } catch { return null; }
}
