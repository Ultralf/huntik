// ═══════════════════════════════════════════════════════════════════════════
//  HUNTIK — Room Engine  (js/room.js)
//  Supabase Realtime-based multiplayer room for GMs and players.
// ═══════════════════════════════════════════════════════════════════════════

// ─── State ────────────────────────────────────────────────────────────────────
let _room       = null;   // current room object from DB
let _roomCode   = null;
let _isAdmin    = false;
let _session    = null;
let _channel    = null;   // Supabase Realtime channel
let _tokens     = {};     // { tokenId: { ...token, el: DOMElement } }
let _scene      = {};     // { imageUrl, gridEnabled, gridSize }
let _initiative = [];     // [ { name, initiative, id, activeTurn } ]
let _currentTurn = 0;
let _presenceMap = {};    // { userId: { username, role } }
let _pendingNPCImage    = null;
let _pendingLibImage    = null;
let _pendingSceneImage  = null;
let _editingTokenId     = null;
let _dragOffset  = { x: 0, y: 0 };
let _draggingToken = null;
let _tokenSize   = 64;    // default px

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
    const params   = new URLSearchParams(window.location.search);
    _roomCode = (params.get('code') || '').toUpperCase();

    _session = await sbRestoreSession();
    if (!_session) { window.location.href = 'index.html'; return; }
    _isAdmin = _session.role === 'admin';

    setMsg('Joining room ' + _roomCode + '…');

    // Mark body class
    document.body.classList.add(_isAdmin ? 'is-admin' : 'is-player');

    // Load room
    const { data: roomData, error } = await _sb.from('rooms').select('*').eq('id', _roomCode).single();
    if (error || !roomData) { setMsg('Room not found or has been closed.'); return; }
    if (!roomData.is_open)  { setMsg('This room is closed.'); return; }

    _room       = roomData;
    _scene      = roomData.scene || {};
    _initiative = roomData.initiative || [];

    // Set UI labels
    document.getElementById('roomCodeDisplay').textContent = _roomCode;
    document.getElementById('roomUserLabel').textContent   = _session.username;

    // Subscribe to Realtime
    _channel = _sb.channel('room:' + _roomCode, { config: { presence: { key: _session.userId } } });

    _channel
        .on('presence', { event: 'sync' }, onPresenceSync)
        .on('broadcast', { event: 'token_moved' },   e => onTokenMoved(e.payload))
        .on('broadcast', { event: 'token_added' },   e => onTokenAdded(e.payload))
        .on('broadcast', { event: 'token_removed' }, e => onTokenRemoved(e.payload))
        .on('broadcast', { event: 'token_updated' }, e => onTokenUpdated(e.payload))
        .on('broadcast', { event: 'scene_updated' }, e => onSceneUpdated(e.payload))
        .on('broadcast', { event: 'initiative_updated' }, e => onInitiativeUpdated(e.payload))
        .on('broadcast', { event: 'chat_message' },  e => onChatMessage(e.payload))
        .on('broadcast', { event: 'room_closed' },   () => onRoomClosed())
        .on('broadcast', { event: 'player_kicked' }, e => { if (e.payload.userId === _session.userId) onKicked(); })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await _channel.track({ username: _session.username, role: _session.role, userId: _session.userId });
                await loadInitialData();
                showRoom();
            }
        });
})();

async function loadInitialData() {
    // Load tokens
    const { data: tokensData } = await _sb.from('room_tokens').select('*').eq('room_id', _roomCode);
    _tokens = {};
    if (tokensData) tokensData.forEach(t => { _tokens[t.id] = t; });

    // Render everything
    applyScene(_scene);
    renderAllTokens();
    renderInitiativeList();

    // Load chat history
    const { data: chatData } = await _sb.from('room_chat')
        .select('*').eq('room_id', _roomCode).order('created_at', { ascending: true }).limit(100);
    if (chatData) chatData.forEach(m => appendChatMessage(m, false));
    scrollChatToBottom();

    // Player tray
    if (!_isAdmin) buildPlayerTray();

    // Admin: load library
    if (_isAdmin) {
        loadTokenLibrary();
        loadSceneLibrary();
    }
}

function showRoom() {
    const loadEl = document.getElementById('roomLoading');
    loadEl.classList.add('fade-out');
    setTimeout(() => { loadEl.style.display = 'none'; }, 400);
    document.getElementById('roomLayout').style.display = 'flex';
}

function setMsg(msg) {
    document.getElementById('roomLoadingMsg').textContent = msg;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchRoomTab(tab) {
    document.querySelectorAll('.room-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.room-tab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`.room-tab-btn[data-rtab="${tab}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById('rtab-' + tab);
    if (content) { content.classList.add('active'); content.style.display = 'flex'; }
    if (tab === 'chat') { document.getElementById('chatTabBtn')?.classList.remove('unread'); scrollChatToBottom(); }
}

// ─── Presence ─────────────────────────────────────────────────────────────────
function onPresenceSync() {
    const state = _channel.presenceState();
    _presenceMap = {};
    Object.values(state).forEach(presences => {
        presences.forEach(p => { _presenceMap[p.userId] = p; });
    });
    const count = Object.keys(_presenceMap).length;
    document.getElementById('roomStatusDot').title = count + ' connected';
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function applyScene(scene) {
    _scene = scene || {};
    const bg = document.getElementById('sceneBgLayer');
    if (bg) {
        bg.style.backgroundImage = _scene.imageUrl ? `url(${_scene.imageUrl})` : 'none';
    }
    drawGrid();
}

function drawGrid() {
    const canvas  = document.getElementById('sceneGridCanvas');
    const sceneEl = document.getElementById('sceneCanvas');
    if (!canvas || !sceneEl) return;
    canvas.width  = sceneEl.offsetWidth  || 1600;
    canvas.height = sceneEl.offsetHeight || 1000;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!_scene.gridEnabled) return;
    const size = _scene.gridSize || 50;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    for (let x = 0; x <= canvas.width; x += size) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += size) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function toggleGrid() {
    if (!_isAdmin) return;
    _scene.gridEnabled = !_scene.gridEnabled;
    const btn    = document.getElementById('gridToggleBtn');
    const sizeEl = document.getElementById('gridSizeLabel');
    if (btn)    btn.classList.toggle('active', _scene.gridEnabled);
    if (sizeEl) sizeEl.style.display = _scene.gridEnabled ? '' : 'none';
    drawGrid();
    pushSceneUpdate();
}

function updateGridSize() {
    if (!_isAdmin) return;
    _scene.gridSize = parseInt(document.getElementById('gridSizeInput')?.value) || 50;
    drawGrid();
    pushSceneUpdate();
}

function pushSceneUpdate() {
    _sb.from('rooms').update({ scene: _scene }).eq('id', _roomCode).then(() => {});
    _channel.send({ type: 'broadcast', event: 'scene_updated', payload: _scene });
}

function onSceneUpdated(scene) {
    applyScene(scene);
    // sync grid toggle button state for admin
    if (_isAdmin) {
        const btn = document.getElementById('gridToggleBtn');
        const sizeEl = document.getElementById('gridSizeLabel');
        if (btn)    btn.classList.toggle('active', !!scene.gridEnabled);
        if (sizeEl) sizeEl.style.display = scene.gridEnabled ? '' : 'none';
    }
}

function openSceneImagePicker() {
    const grid = document.getElementById('sceneLibraryGrid');
    if (grid && grid.children.length > 0) {
        switchRoomTab('scenes');
    } else {
        switchRoomTab('scenes');
    }
}

// ─── Tokens — render ─────────────────────────────────────────────────────────
function renderAllTokens() {
    const layer = document.getElementById('sceneTokensLayer');
    if (!layer) return;
    layer.innerHTML = '';
    Object.values(_tokens).forEach(t => renderToken(t));
}

function renderToken(t) {
    if (!t || !t.id) return;
    const layer = document.getElementById('sceneTokensLayer');
    if (!layer) return;

    // Players can't see admin NPC tokens that are hidden
    if (!_isAdmin && t.owner_id === null && t.is_hidden) return;

    const size   = (_tokenSize * (t.size || 1));
    const isNPC  = !t.owner_id;
    const hpPct  = (t.hp_max && t.hp_max > 0) ? Math.max(0, Math.min(100, Math.round((t.hp_current / t.hp_max) * 100))) : null;
    const hpClass = hpPct !== null ? (hpPct > 60 ? '' : hpPct > 25 ? 'medium' : 'low') : '';

    // For players viewing NPC tokens: show bar only, no values
    const showValues = _isAdmin || !!t.owner_id;

    const el = document.createElement('div');
    el.className = 'scene-token' + (isNPC ? ' admin-npc' : '');
    el.dataset.id = t.id;
    el.style.left = (t.x || 100) + 'px';
    el.style.top  = (t.y || 100) + 'px';

    // Inner letter or image
    const firstLetter = (t.name || '?').charAt(0).toUpperCase();
    const imgContent  = t.image_url
        ? `<img src="${t.image_url}" alt="${t.name}" draggable="false">`
        : `<span>${firstLetter}</span>`;

    // HP bar — always show for all, but values hidden from players on NPC tokens
    const hpBar = (hpPct !== null)
        ? `<div class="token-hp-bar-wrap" style="width:${size * 0.85}px">
               <div class="token-hp-bar-fill ${hpClass}" style="width:${hpPct}%"></div>
           </div>`
        : '';

    el.innerHTML = `
        <div class="token-circle" style="width:${size}px;height:${size}px;font-size:${size*0.38}px">${imgContent}</div>
        ${hpBar}
        <div class="token-name-tag">${t.name}${t.label ? ' ' + t.label : ''}</div>`;

    // Events
    el.addEventListener('mousedown', e => startDrag(e, t.id));
    el.addEventListener('click', e => { e.stopPropagation(); openTokenPopup(t.id, e); });

    layer.appendChild(el);
    _tokens[t.id] = { ..._tokens[t.id], ...t, el };
}

function refreshToken(id) {
    const t = _tokens[id]; if (!t) return;
    // Remove old element
    if (t.el) t.el.remove();
    renderToken(t);
}

// ─── Drag ─────────────────────────────────────────────────────────────────────
function startDrag(e, tokenId) {
    e.preventDefault();
    const t = _tokens[tokenId]; if (!t) return;
    // Only admin can drag NPC tokens; players can drag their own
    if (!_isAdmin && !t.owner_id) return;
    if (!_isAdmin && t.owner_id !== _session.userId) return;

    _draggingToken = tokenId;
    const el = t.el || document.querySelector(`.scene-token[data-id="${tokenId}"]`);
    if (!el) return;
    const wrap    = document.getElementById('sceneWrap');
    const wrapRect = wrap.getBoundingClientRect();
    const canvasEl = document.getElementById('sceneCanvas');
    const scrollLeft = wrap.scrollLeft;
    const scrollTop  = wrap.scrollTop;
    _dragOffset.x = e.clientX - wrapRect.left + scrollLeft - t.x;
    _dragOffset.y = e.clientY - wrapRect.top  + scrollTop  - t.y;

    function onMove(e2) {
        if (!_draggingToken) return;
        const newX = e2.clientX - wrapRect.left + wrap.scrollLeft - _dragOffset.x;
        const newY = e2.clientY - wrapRect.top  + wrap.scrollTop  - _dragOffset.y;
        const el2  = document.querySelector(`.scene-token[data-id="${_draggingToken}"]`);
        if (el2) { el2.style.left = newX + 'px'; el2.style.top = newY + 'px'; }
        // Snap to grid if enabled
    }
    function onUp(e2) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        if (!_draggingToken) return;
        const finalX = e2.clientX - wrapRect.left + wrap.scrollLeft - _dragOffset.x;
        const finalY = e2.clientY - wrapRect.top  + wrap.scrollTop  - _dragOffset.y;
        // Snap to grid
        let snappedX = finalX, snappedY = finalY;
        if (_scene.gridEnabled) {
            const gs = _scene.gridSize || 50;
            snappedX = Math.round(finalX / gs) * gs;
            snappedY = Math.round(finalY / gs) * gs;
        }
        const el2 = document.querySelector(`.scene-token[data-id="${_draggingToken}"]`);
        if (el2) { el2.style.left = snappedX + 'px'; el2.style.top = snappedY + 'px'; }
        _tokens[_draggingToken].x = snappedX;
        _tokens[_draggingToken].y = snappedY;
        // Push update
        _sb.from('room_tokens').update({ x: snappedX, y: snappedY }).eq('id', _draggingToken).then(() => {});
        _channel.send({ type: 'broadcast', event: 'token_moved', payload: { id: _draggingToken, x: snappedX, y: snappedY } });
        _draggingToken = null;
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
}

function onTokenMoved(payload) {
    const { id, x, y } = payload; if (!id) return;
    if (_tokens[id]) { _tokens[id].x = x; _tokens[id].y = y; }
    const el = document.querySelector(`.scene-token[data-id="${id}"]`);
    if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
}

// ─── Token added / removed / updated ─────────────────────────────────────────
function onTokenAdded(t) {
    _tokens[t.id] = t;
    renderToken(t);
}

function onTokenRemoved(payload) {
    const { id } = payload;
    if (_tokens[id]?.el) _tokens[id].el.remove();
    delete _tokens[id];
    if (_editingTokenId === id) closeTokenPopup();
}

function onTokenUpdated(t) {
    if (!_tokens[t.id]) return;
    _tokens[t.id] = { ..._tokens[t.id], ...t };
    refreshToken(t.id);
    if (_editingTokenId === t.id) openTokenPopup(t.id, null);
}

// ─── Token popup ──────────────────────────────────────────────────────────────
function openTokenPopup(tokenId, e) {
    const t = _tokens[tokenId]; if (!t) return;
    _editingTokenId = tokenId;
    const popup = document.getElementById('tokenPopup');
    popup.style.display = 'block';

    // Position near click
    if (e) {
        let px = e.clientX + 12, py = e.clientY - 20;
        if (px + 200 > window.innerWidth)  px = e.clientX - 212;
        if (py + 250 > window.innerHeight) py = window.innerHeight - 260;
        popup.style.left = px + 'px';
        popup.style.top  = py + 'px';
    }

    document.getElementById('tokenPopupName').textContent = t.name + (t.label ? ' ' + t.label : '');

    const isNPC = !t.owner_id;
    const showValues = _isAdmin || !isNPC;

    // Stats
    let statsHTML = '';
    if (t.hp_max) {
        if (showValues) {
            statsHTML += `<div class="popup-stat-row">
                <span class="popup-stat-label">HP</span>
                <span class="popup-stat-val">${t.hp_current}/${t.hp_max}</span>
                <div class="popup-stat-btns">
                    <button class="popup-stat-btn danger" onclick="adjustTokenHP('${t.id}', -1)" title="-1">-</button>
                    <button class="popup-stat-btn" onclick="adjustTokenHP('${t.id}', 1)" title="+1">+</button>
                    <button class="popup-stat-btn" onclick="promptAdjust('${t.id}','hp')" title="Custom">±</button>
                </div>
            </div>`;
        }
    }
    if (t.sta_max) {
        statsHTML += `<div class="popup-stat-row">
            <span class="popup-stat-label">STA</span>
            <span class="popup-stat-val">${t.sta_current}/${t.sta_max}</span>
            <div class="popup-stat-btns">
                <button class="popup-stat-btn danger" onclick="adjustTokenSTA('${t.id}', -1)">-</button>
                <button class="popup-stat-btn" onclick="adjustTokenSTA('${t.id}', 1)">+</button>
                <button class="popup-stat-btn" onclick="promptAdjust('${t.id}','sta')">±</button>
            </div>
        </div>`;
    }
    document.getElementById('tokenPopupStats').innerHTML = statsHTML;

    // Player actions (can only control own tokens)
    const canControl = _isAdmin || (t.owner_id === _session.userId);
    let actionsHTML = '';
    if (canControl && t.hp_max) {
        actionsHTML += `<button class="btn btn-sm btn-secondary" onclick="resetTokenHP('${t.id}')">Full HP</button>`;
    }
    document.getElementById('tokenPopupActions').innerHTML = actionsHTML;

    // Admin footer
    let footerHTML = '';
    if (_isAdmin) {
        footerHTML = `
            <button class="btn btn-sm btn-secondary" onclick="toggleTokenHidden('${t.id}')">${t.is_hidden ? 'Show' : 'Hide'}</button>
            <button class="btn btn-sm btn-danger" onclick="removeToken('${t.id}')">Remove</button>`;
    }
    document.getElementById('tokenPopupFooter').innerHTML = footerHTML;
}

function closeTokenPopup() {
    document.getElementById('tokenPopup').style.display = 'none';
    _editingTokenId = null;
}

// Close popup when clicking canvas background
document.getElementById('sceneCanvas')?.addEventListener('click', e => {
    if (e.target === document.getElementById('sceneCanvas') ||
        e.target === document.getElementById('sceneTokensLayer') ||
        e.target === document.getElementById('sceneBgLayer')) {
        closeTokenPopup();
    }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTokenPopup(); });

// ─── Token HP / STA adjustments ───────────────────────────────────────────────
async function adjustTokenHP(id, delta) {
    const t = _tokens[id]; if (!t) return;
    const newHP = Math.max(0, Math.min(t.hp_max || 999, (t.hp_current || 0) + delta));
    await updateTokenField(id, { hp_current: newHP });
}

async function adjustTokenSTA(id, delta) {
    const t = _tokens[id]; if (!t) return;
    const newSTA = Math.max(0, Math.min(t.sta_max || 999, (t.sta_current || 0) + delta));
    await updateTokenField(id, { sta_current: newSTA });
}

async function resetTokenHP(id) {
    const t = _tokens[id]; if (!t || !t.hp_max) return;
    await updateTokenField(id, { hp_current: t.hp_max });
}

function promptAdjust(id, stat) {
    const val = prompt(`Enter adjustment (positive or negative) for ${stat.toUpperCase()}:`);
    if (val === null) return;
    const delta = parseInt(val);
    if (isNaN(delta)) return;
    if (stat === 'hp')  adjustTokenHP(id, delta);
    if (stat === 'sta') adjustTokenSTA(id, delta);
}

async function updateTokenField(id, fields) {
    const t = _tokens[id]; if (!t) return;
    Object.assign(_tokens[id], fields);
    await _sb.from('room_tokens').update(fields).eq('id', id);
    _channel.send({ type: 'broadcast', event: 'token_updated', payload: { id, ...fields } });
    refreshToken(id);
    if (_editingTokenId === id) openTokenPopup(id, null);
}

async function toggleTokenHidden(id) {
    if (!_isAdmin) return;
    const t = _tokens[id]; if (!t) return;
    await updateTokenField(id, { is_hidden: !t.is_hidden });
}

async function removeToken(id) {
    if (!_isAdmin) return;
    await _sb.from('room_tokens').delete().eq('id', id);
    _channel.send({ type: 'broadcast', event: 'token_removed', payload: { id } });
    if (_tokens[id]?.el) _tokens[id].el.remove();
    delete _tokens[id];
    closeTokenPopup();
}

async function clearAllTokens() {
    if (!_isAdmin || !confirm('Remove all tokens from scene?')) return;
    await _sb.from('room_tokens').delete().eq('room_id', _roomCode);
    Object.keys(_tokens).forEach(id => {
        if (_tokens[id]?.el) _tokens[id].el.remove();
        _channel.send({ type: 'broadcast', event: 'token_removed', payload: { id } });
    });
    _tokens = {};
    closeTokenPopup();
}

// ─── Add NPC Token (admin) ────────────────────────────────────────────────────
function openAddNPCTokenModal() {
    _pendingNPCImage = null;
    document.getElementById('npcTokenModalTitle').textContent = 'New NPC Token';
    document.getElementById('npc-name').value = '';
    document.getElementById('npc-hp').value   = '';
    document.getElementById('npc-size').value = '1';
    document.getElementById('npc-img-preview').innerHTML = '<span class="img-placeholder-text">?</span>';
    document.getElementById('npc-img-input').value = '';
    openModal('npcTokenModal');
}

document.getElementById('npc-img-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    resizeImageFile(file, 256, 0.82, dataUrl => {
        _pendingNPCImage = dataUrl;
        document.getElementById('npc-img-preview').innerHTML = `<img src="${dataUrl}">`;
    });
});

async function confirmAddNPCToken() {
    const name = document.getElementById('npc-name').value.trim();
    const hp   = parseInt(document.getElementById('npc-hp').value) || null;
    const size = parseFloat(document.getElementById('npc-size').value) || 1;
    if (!name) { alert('Name is required.'); return; }

    let imageUrl = null;
    if (_pendingNPCImage) {
        imageUrl = await sbUploadImage(_pendingNPCImage, `rooms/${_roomCode}/npc_${Date.now()}.jpg`) || _pendingNPCImage;
    }

    const canvas = document.getElementById('sceneCanvas');
    const cx = (canvas?.offsetWidth  || 800) / 2;
    const cy = (canvas?.offsetHeight || 500) / 2;

    const { data, error } = await _sb.from('room_tokens').insert({
        room_id: _roomCode, owner_id: null,
        name, image_url: imageUrl, token_type: 'npc',
        hp_max: hp, hp_current: hp, sta_max: null, sta_current: null,
        x: cx, y: cy, size, is_hidden: false,
    }).select().single();

    if (error || !data) { alert('Failed to add token: ' + (error?.message || '')); return; }
    _tokens[data.id] = data;
    renderToken(data);
    _channel.send({ type: 'broadcast', event: 'token_added', payload: data });
    closeModal('npcTokenModal');
}

// ─── Player token tray ────────────────────────────────────────────────────────
function buildPlayerTray() {
    // Get character + titans from the parent page cache
    // We use window.parent or direct cache if in same page
    const char   = window._characterCache;
    const titans = window._titansCache || [];
    const container = document.getElementById('trayTokensContainer');
    if (!container) return;
    container.innerHTML = '';

    // Character token
    if (char) {
        const el = makeTrayToken(
            char.name || 'Character',
            `(${_session.username})`,
            char.image,
            'character',
            char.stats?.DEF ? Math.round(char.stats.DEF * 5.5 + 10) : null, // approx HP
            null
        );
        container.appendChild(el);
    }

    // Titan tokens
    titans.forEach(t => {
        const el = makeTrayToken(
            t.name || 'Titan',
            `(${_session.username})`,
            t.image,
            'titan',
            null, null
        );
        container.appendChild(el);
    });
}

function makeTrayToken(name, label, imageUrl, type, hpMax, staMax) {
    const el = document.createElement('div');
    el.className = 'tray-token';
    el.title     = name + ' ' + label;
    el.dataset.trayName    = name;
    el.dataset.trayLabel   = label;
    el.dataset.trayImage   = imageUrl || '';
    el.dataset.trayType    = type;
    el.dataset.trayHpMax   = hpMax || '';
    el.dataset.trayStaMax  = staMax || '';

    const firstLetter = name.charAt(0).toUpperCase();
    el.innerHTML = imageUrl
        ? `<img src="${imageUrl}" alt="${name}" draggable="false">`
        : `<span>${firstLetter}</span>`;

    const labelEl = document.createElement('div');
    labelEl.className = 'tray-token-label';
    labelEl.textContent = name;
    el.appendChild(labelEl);

    // Drag from tray to scene
    el.addEventListener('mousedown', e => startTrayDrag(e, el));
    return el;
}

function startTrayDrag(e, trayEl) {
    e.preventDefault();
    const ghost = trayEl.cloneNode(true);
    ghost.style.cssText = `position:fixed;width:54px;height:54px;border-radius:50%;pointer-events:none;z-index:9999;opacity:0.85;transform:translate(-50%,-50%);`;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';
    document.body.appendChild(ghost);

    function onMove(e2) {
        ghost.style.left = e2.clientX + 'px';
        ghost.style.top  = e2.clientY + 'px';
    }
    async function onUp(e2) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        ghost.remove();

        // Check if dropped on scene canvas
        const wrap = document.getElementById('sceneWrap');
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        if (e2.clientX < rect.left || e2.clientX > rect.right ||
            e2.clientY < rect.top  || e2.clientY > rect.bottom) return;

        const x = e2.clientX - rect.left + wrap.scrollLeft;
        const y = e2.clientY - rect.top  + wrap.scrollTop;

        const name    = trayEl.dataset.trayName;
        const label   = trayEl.dataset.trayLabel;
        const imageUrl= trayEl.dataset.trayImage || null;
        const type    = trayEl.dataset.trayType;
        const hpMax   = parseInt(trayEl.dataset.trayHpMax) || null;
        const staMax  = parseInt(trayEl.dataset.trayStaMax) || null;

        // Don't place duplicate character token
        if (type === 'character') {
            const existing = Object.values(_tokens).find(t =>
                t.owner_id === _session.userId && t.token_type === 'character');
            if (existing) { alert('Your character token is already on the scene.'); return; }
        }

        const { data, error } = await _sb.from('room_tokens').insert({
            room_id: _roomCode, owner_id: _session.userId,
            name, label, image_url: imageUrl, token_type: type,
            hp_max: hpMax, hp_current: hpMax,
            sta_max: staMax, sta_current: staMax,
            x, y, size: 1, is_hidden: false,
        }).select().single();

        if (error || !data) { alert('Failed to place token.'); return; }
        _tokens[data.id] = data;
        renderToken(data);
        _channel.send({ type: 'broadcast', event: 'token_added', payload: data });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
}

// ─── Token Library (admin) ────────────────────────────────────────────────────
async function loadTokenLibrary() {
    const { data } = await _sbA.from('token_library').select('*').order('created_at', { ascending: false });
    renderLibraryGrid(data || []);
}

function renderLibraryGrid(tokens) {
    const grid = document.getElementById('libraryGrid'); if (!grid) return;
    if (tokens.length === 0) {
        grid.innerHTML = `<div class="placeholder-empty">No tokens in library yet. Create one!</div>`;
        return;
    }
    grid.innerHTML = tokens.map(t => {
        const firstLetter = t.name.charAt(0).toUpperCase();
        const imgContent  = t.image_url
            ? `<img src="${t.image_url}" alt="${t.name}">`
            : `<div class="library-card-img">${firstLetter}</div>`;
        return `
        <div class="library-card">
            <div class="library-card-img">${t.image_url ? `<img src="${t.image_url}">` : firstLetter}</div>
            <div class="library-card-body">
                <div class="library-card-name">${t.name}</div>
                <div class="library-card-sub">HP: ${t.hp_max || '—'}${t.notes ? ' · ' + t.notes.substring(0,20) : ''}</div>
            </div>
            <div class="library-card-actions">
                <button class="btn btn-sm btn-primary" onclick="placeLibraryToken('${t.id}')">Place</button>
                <button class="btn btn-sm btn-danger" onclick="deleteLibraryToken('${t.id}')">✕</button>
            </div>
        </div>`;
    }).join('');
}

function openCreateLibraryTokenModal() {
    _pendingLibImage = null;
    document.getElementById('lib-name').value  = '';
    document.getElementById('lib-hp').value    = '';
    document.getElementById('lib-notes').value = '';
    document.getElementById('lib-img-preview').innerHTML = '<span class="img-placeholder-text">?</span>';
    document.getElementById('lib-img-input').value = '';
    openModal('libraryTokenModal');
}

document.getElementById('lib-img-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    resizeImageFile(file, 256, 0.82, dataUrl => {
        _pendingLibImage = dataUrl;
        document.getElementById('lib-img-preview').innerHTML = `<img src="${dataUrl}">`;
    });
});

async function confirmCreateLibraryToken() {
    const name  = document.getElementById('lib-name').value.trim();
    const hp    = parseInt(document.getElementById('lib-hp').value) || null;
    const notes = document.getElementById('lib-notes').value.trim();
    if (!name) { alert('Name required.'); return; }

    let imageUrl = null;
    if (_pendingLibImage) {
        imageUrl = await sbUploadImage(_pendingLibImage, `library/${_session.userId}/${Date.now()}.jpg`) || _pendingLibImage;
    }

    const { error } = await _sbA.from('token_library').insert({
        owner_id: _session.userId, name, image_url: imageUrl, hp_max: hp, notes, token_type: 'npc',
    });
    if (error) { alert('Failed: ' + error.message); return; }
    closeModal('libraryTokenModal');
    loadTokenLibrary();
}

async function placeLibraryToken(libId) {
    const { data: t } = await _sbA.from('token_library').select('*').eq('id', libId).single();
    if (!t) return;
    const canvas = document.getElementById('sceneCanvas');
    const cx = (canvas?.offsetWidth  || 800) / 2;
    const cy = (canvas?.offsetHeight || 500) / 2;

    const { data, error } = await _sb.from('room_tokens').insert({
        room_id: _roomCode, owner_id: null,
        name: t.name, image_url: t.image_url, token_type: 'npc',
        hp_max: t.hp_max, hp_current: t.hp_max, sta_max: null, sta_current: null,
        x: cx, y: cy, size: 1, is_hidden: false,
    }).select().single();

    if (error || !data) { alert('Failed.'); return; }
    _tokens[data.id] = data;
    renderToken(data);
    _channel.send({ type: 'broadcast', event: 'token_added', payload: data });
    switchRoomTab('scene');
}

async function deleteLibraryToken(libId) {
    if (!confirm('Delete this token from library permanently?')) return;
    await _sbA.from('token_library').delete().eq('id', libId);
    loadTokenLibrary();
}

function openTokenLibraryPanel() {
    switchRoomTab('library');
}

// ─── Scene Library ────────────────────────────────────────────────────────────
async function loadSceneLibrary() {
    const { data } = await _sbA.from('scene_library').select('*').order('created_at', { ascending: false });
    renderSceneLibraryGrid(data || []);
}

function renderSceneLibraryGrid(scenes) {
    const grid = document.getElementById('sceneLibraryGrid'); if (!grid) return;
    if (scenes.length === 0) {
        grid.innerHTML = `<div class="placeholder-empty">No scene images yet. Upload one!</div>`;
        return;
    }
    grid.innerHTML = scenes.map(s => `
        <div class="library-card">
            <div class="library-card-img"><img src="${s.image_url}" alt="${s.name}"></div>
            <div class="library-card-body"><div class="library-card-name">${s.name}</div></div>
            <div class="library-card-actions">
                <button class="btn btn-sm btn-primary" onclick="setSceneBackground('${s.image_url}')">Set Scene</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSceneImage('${s.id}')">✕</button>
            </div>
        </div>`).join('');
}

function openUploadSceneModal() {
    _pendingSceneImage = null;
    document.getElementById('scene-img-name').value = '';
    document.getElementById('scene-img-preview').innerHTML = '<span class="img-placeholder-text">Click to upload</span>';
    document.getElementById('scene-img-input').value = '';
    openModal('uploadSceneModal');
}

document.getElementById('scene-img-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    resizeImageFile(file, 1600, 0.9, dataUrl => {
        _pendingSceneImage = dataUrl;
        document.getElementById('scene-img-preview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:120px;object-fit:cover">`;
    });
});

async function confirmUploadSceneImage() {
    const name = document.getElementById('scene-img-name').value.trim() || 'Scene';
    if (!_pendingSceneImage) { alert('Please select an image.'); return; }
    const imageUrl = await sbUploadImage(_pendingSceneImage, `scenes/${_session.userId}/${Date.now()}.jpg`) || _pendingSceneImage;
    await _sbA.from('scene_library').insert({ owner_id: _session.userId, name, image_url: imageUrl });
    closeModal('uploadSceneModal');
    loadSceneLibrary();
}

async function deleteSceneImage(id) {
    if (!confirm('Delete this scene image?')) return;
    await _sbA.from('scene_library').delete().eq('id', id);
    loadSceneLibrary();
}

function setSceneBackground(url) {
    _scene.imageUrl = url;
    applyScene(_scene);
    pushSceneUpdate();
    switchRoomTab('scene');
}

// ─── Initiative ────────────────────────────────────────────────────────────────
function renderInitiativeList() {
    const list = document.getElementById('initiativeList'); if (!list) return;
    if (_initiative.length === 0) {
        list.innerHTML = `<div class="placeholder-empty">No entries yet.</div>`;
        return;
    }
    list.innerHTML = _initiative.map((entry, i) => `
        <div class="initiative-entry ${i === _currentTurn ? 'active-turn' : ''}">
            <div class="init-roll-badge">${entry.initiative}</div>
            <div class="init-name">${entry.name}${i === _currentTurn ? ' ◀' : ''}</div>
            ${_isAdmin ? `<div class="init-actions">
                <button class="btn btn-sm btn-ghost" onclick="removeInitiativeEntry(${i})">✕</button>
            </div>` : ''}
        </div>`).join('');
}

function openAddInitiativeModal() {
    document.getElementById('init-name').value = '';
    document.getElementById('init-roll').value = '';
    openModal('initiativeModal');
}

function addInitiativeEntry() {
    const name = document.getElementById('init-name').value.trim();
    const roll = parseInt(document.getElementById('init-roll').value) || 0;
    if (!name) { alert('Name required.'); return; }
    _initiative.push({ name, initiative: roll, id: Date.now().toString() });
    pushInitiativeUpdate();
    closeModal('initiativeModal');
}

function removeInitiativeEntry(idx) {
    _initiative.splice(idx, 1);
    if (_currentTurn >= _initiative.length) _currentTurn = 0;
    pushInitiativeUpdate();
}

function sortInitiative() {
    _initiative.sort((a, b) => b.initiative - a.initiative);
    _currentTurn = 0;
    pushInitiativeUpdate();
}

function nextTurn() {
    _currentTurn = (_currentTurn + 1) % Math.max(1, _initiative.length);
    pushInitiativeUpdate();
    // System message in chat
    if (_initiative[_currentTurn]) {
        sendSystemMessage(`▶ ${_initiative[_currentTurn].name}'s turn`);
    }
}

function clearInitiative() {
    if (!confirm('Clear all initiative entries?')) return;
    _initiative = [];
    _currentTurn = 0;
    pushInitiativeUpdate();
}

function pushInitiativeUpdate() {
    _sb.from('rooms').update({ initiative: _initiative }).eq('id', _roomCode).then(() => {});
    _channel.send({ type: 'broadcast', event: 'initiative_updated', payload: { initiative: _initiative, currentTurn: _currentTurn } });
    renderInitiativeList();
}

function onInitiativeUpdated(payload) {
    _initiative   = payload.initiative   || [];
    _currentTurn  = payload.currentTurn  || 0;
    renderInitiativeList();
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text  = input?.value?.trim();
    if (!text) return;
    input.value = '';

    const msg = {
        room_id:  _roomCode,
        user_id:  _session.userId,
        username: _session.username,
        message:  text,
        msg_type: 'chat',
        created_at: new Date().toISOString(),
    };
    await _sb.from('room_chat').insert(msg);
    _channel.send({ type: 'broadcast', event: 'chat_message', payload: msg });
    appendChatMessage(msg, true);
    scrollChatToBottom();
}

async function sendSystemMessage(text) {
    const msg = {
        room_id:  _roomCode,
        user_id:  _session.userId,
        username: 'System',
        message:  text,
        msg_type: 'system',
        created_at: new Date().toISOString(),
    };
    await _sb.from('room_chat').insert(msg);
    _channel.send({ type: 'broadcast', event: 'chat_message', payload: msg });
    appendChatMessage(msg, false);
    scrollChatToBottom();
}

function onChatMessage(msg) {
    appendChatMessage(msg, false);
    scrollChatToBottom();
    // Unread badge if not on chat tab
    const chatContent = document.getElementById('rtab-chat');
    if (!chatContent?.classList.contains('active')) {
        document.getElementById('chatTabBtn')?.classList.add('unread');
    }
}

function appendChatMessage(msg, isOwn) {
    const container = document.getElementById('chatMessages'); if (!container) return;
    const div = document.createElement('div');
    const type = msg.msg_type || 'chat';
    div.className = `chat-msg ${type} ${(isOwn || msg.user_id === _session?.userId) ? 'own' : ''}`;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = type !== 'system' ? `
        <div class="chat-msg-header">${msg.username} · ${time}</div>
        <div class="chat-bubble">${escapeHtml(msg.message)}</div>
    ` : `<div class="chat-bubble">${escapeHtml(msg.message)}</div>`;
    container.appendChild(div);
}

function scrollChatToBottom() {
    const c = document.getElementById('chatMessages');
    if (c) setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
}

function escapeHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Dice ─────────────────────────────────────────────────────────────────────
function openDiceRoller() { openModal('diceModal'); }

function rollDice(sides) {
    const result = Math.floor(Math.random() * sides) + 1;
    document.getElementById('diceResult').textContent = `d${sides}: ${result}`;
    sendRollToChat(1, sides, [result]);
}

function rollCustomDice() {
    const count = parseInt(document.getElementById('dice-count').value) || 1;
    const sides = parseInt(document.getElementById('dice-sides').value) || 20;
    const rolls = [];
    let total = 0;
    for (let i = 0; i < Math.min(count, 20); i++) {
        const r = Math.floor(Math.random() * sides) + 1;
        rolls.push(r); total += r;
    }
    document.getElementById('diceResult').textContent = `${count}d${sides}: [${rolls.join(', ')}] = ${total}`;
    sendRollToChat(count, sides, rolls);
}

async function sendRollToChat(count, sides, rolls) {
    const total = rolls.reduce((a,b)=>a+b,0);
    const text  = `🎲 ${count}d${sides}: [${rolls.join(', ')}] = ${total}`;
    const msg = {
        room_id: _roomCode, user_id: _session.userId, username: _session.username,
        message: text, msg_type: 'roll', created_at: new Date().toISOString(),
    };
    await _sb.from('room_chat').insert(msg);
    _channel.send({ type: 'broadcast', event: 'chat_message', payload: msg });
    appendChatMessage(msg, true);
    scrollChatToBottom();
}

// ─── Player Sheet Sidebar ─────────────────────────────────────────────────────
function togglePlayerSheet() {
    document.getElementById('playerSheetSidebar').classList.toggle('open');
}

// ─── Room management ──────────────────────────────────────────────────────────
async function leaveRoom() {
    if (!confirm('Leave this room?')) return;
    await _channel?.unsubscribe();
    window.location.href = _isAdmin ? 'admin.html' : 'player.html';
}

async function confirmCloseRoom() {
    if (!_isAdmin) return;
    if (!confirm('Close this room for everyone? This will kick all players.')) return;
    _channel.send({ type: 'broadcast', event: 'room_closed', payload: {} });
    await _sb.from('rooms').update({ is_open: false }).eq('id', _roomCode);
    await _channel.unsubscribe();
    window.location.href = 'admin.html';
}

function onRoomClosed() {
    if (_isAdmin) return;
    alert('The GM has closed the room.');
    window.location.href = 'player.html';
}

function onKicked() {
    alert('You have been removed from the room by the GM.');
    window.location.href = 'player.html';
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// Unread badge style
const unreadStyle = document.createElement('style');
unreadStyle.textContent = `
#chatTabBtn.unread { color: var(--gold); position: relative; }
#chatTabBtn.unread::after { content:''; position:absolute; top:4px; right:4px; width:6px; height:6px; background:var(--danger); border-radius:50%; }
`;
document.head.appendChild(unreadStyle);
