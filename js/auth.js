// ─── auth.js ──────────────────────────────────────────────────────────────────
//  Thin wrapper. Session state lives in sessionStorage (same as before).
//  All actual auth calls go through supabase.js.
// ─────────────────────────────────────────────────────────────────────────────

// getSession / clearSession are defined in supabase.js and used throughout app.

// ─── Login page logic ─────────────────────────────────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    // Check if already logged in
    sbRestoreSession().then(session => {
        if (session) {
            window.location.href = session.role === 'admin' ? 'admin.html' : 'player.html';
        }
    });

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const loginInput = document.getElementById('username').value.trim();
        const password   = document.getElementById('password').value;
        const errorEl    = document.getElementById('errorMessage');
        const submitBtn  = loginForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';

        // Username is used as email prefix: username@huntik.local
        // This allows players to log in with just their username
        const email = loginInput.includes('@') ? loginInput : `${loginInput}@huntik.local`;

        const result = await sbSignIn(email, password);

        if (result.ok) {
            window.location.href = result.role === 'admin' ? 'admin.html' : 'player.html';
        } else {
            errorEl.classList.add('visible');
            document.getElementById('password').value = '';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enter Session';
        }
    });

    ['username', 'password'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            document.getElementById('errorMessage').classList.remove('visible');
        });
    });
}
