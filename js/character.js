// ─── Per-user storage — backed by Supabase via supabase.js cache ─────────────
// loadCharacter / saveCharacter / loadCharacterByUsername / saveCharacterForUser
// are defined as async in supabase.js.
// Here we wrap them so the rest of character.js can call them synchronously
// using the in-memory cache (_characterCache) that supabase.js maintains.

// Synchronous wrappers (safe because cache is always warm after initCharacterPage)
function loadCharacter() {
    // Return from in-memory cache (set by supabase.js after async load)
    return window._characterCache ? JSON.parse(JSON.stringify(window._characterCache)) : null;
}

function saveCharacter(char) {
    window._characterCache = JSON.parse(JSON.stringify(char));
    // Async save to Supabase (fire and forget)
    sbSaveCharacter(char).catch(e => console.error('saveCharacter error', e));
}

// These are only used by admin — they remain async and called with await in admin.html
// loadCharacterByUsername and saveCharacterForUser come from supabase.js directly

// ─── Blank character ──────────────────────────────────────────────────────────
function blankCharacter() {
    return {
        name: '', originFeat: '', alignment: 'Neutral',
        image: null, rank: 'D-',
        stats: { STR: 10, AGL: 10, DEF: 10, WLL: 10, INT: 10, PCHA: 10, NCHA: 10 },
        improvement: { combatMastering: 0, mentalMastering: 0, socialInteraction: 0 },
        training: { PPM: 0, PPArm: 0, PPA: 0, PPR: 0 },
        knownCombatStyles:  [],  // [{ name, passive }]
        knownWeaponStyles:  [],  // ['Light', 'Heavy', ...]
        knownCombatMoves:   [],  // [{ name, rank, effect, stats, cost }]
        spells:    [],           // [{ id, name, rank, class, effect, stats, tags, holotome }]
        weapons:   [],
        shards:    {},           // { materialName: count }
        keyItems:  [],           // [{ name, quantity }]
        items:     [],
        artifacts: [],
        rankUpFeats:    [],      // [{ name, passive, variation }]
        divisionUpFeats:[],      // [{ name, passive, variation }]
    };
}

// ─── Pending image ────────────────────────────────────────────────────────────
let _pendingCharImage = null;

// ─── Training costs ───────────────────────────────────────────────────────────
const MOVE_COST_PPM  = { D: 60,  C: 120, B: 200, A: 300, S: 600 };
const MOVE_COST_PPARM= { D: 80,  C: 160, B: 250, A: 400, S: 800 };
const SPELL_COST_PPA = { D: 80,  C: 160, B: 250, A: 400, S: 800 };
const HOLOTOME_EXTRA = 50;

function getSpellCost(rank, holotome) {
    const letter = rank.replace(/[-+]/g, '');
    const base = SPELL_COST_PPA[letter] || 80;
    return base + (holotome ? HOLOTOME_EXTRA : 0);
}

function getMoveCostPPM(rank, holotome) {
    const base = MOVE_COST_PPM[rank] || 60;
    return base + (holotome ? HOLOTOME_EXTRA : 0);
}

function getStyleCostPPM(holotome)   { return 300 + (holotome ? HOLOTOME_EXTRA : 0); }
function getWeaponStyleCost(holotome){ return 400 + (holotome ? HOLOTOME_EXTRA : 0); }

// ─── Render: sheet view ───────────────────────────────────────────────────────
function renderSheet(char) {
    const d = deriveStats(char);
    const s = char.stats;
    const rank = d.rank;
    const rl = getRankLetter(rank);

    document.getElementById('sheetView').innerHTML = `
        <div class="sheet-header">
            <div class="sheet-header-main">
                <div class="char-portrait ${char.image ? '' : 'char-portrait-empty'}"
                     onclick="openEditModal()" title="Edit character">
                    ${char.image ? `<img src="${char.image}" alt="${char.name}">` : '?'}
                </div>
                <div style="flex:1">
                    <h2 class="char-name">${char.name}</h2>
                    <div class="sheet-badges">
                        <span class="badge badge-rank rank-${rl.toLowerCase()}">${rank}</span>
                        <span class="badge badge-alignment">${char.alignment}</span>
                    </div>
                    <div class="stat-total-note">Stat total: ${d.statTotal}</div>
                </div>
            </div>
            <div class="sheet-header-info">
                <div class="info-item"><span class="info-label">Origin Feat</span><span class="info-value">${char.originFeat || '—'}</span></div>
                <div class="info-item">
                    <span class="info-label">Combat Styles</span>
                    <span class="info-value">${char.knownCombatStyles?.map(s=>s.name||s).join(', ') || '—'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Weapon Styles</span>
                    <span class="info-value">${char.knownWeaponStyles?.join(', ') || '—'}</span>
                </div>
            </div>
        </div>

        <div class="sheet-section">
            <h3 class="section-title">Primary Stats</h3>
            <div class="stats-grid">
                ${renderStatCard('STR', s.STR)}
                ${renderStatCard('AGL', s.AGL)}
                ${renderStatCard('DEF', s.DEF)}
                ${renderStatCard('WLL', s.WLL)}
                ${renderStatCard('INT', s.INT)}
                ${renderStatCard('PCHA', s.PCHA, 'Positive CHA')}
                ${renderStatCard('NCHA', s.NCHA, 'Negative CHA')}
                ${renderStatCard('CHA',  d.CHA,  'Charisma')}
            </div>
        </div>

        <div class="sheet-section">
            <h3 class="section-title">Derived Stats</h3>
            <div class="derived-grid">
                <div class="derived-card"><span class="derived-label">HP</span><span class="derived-value">${d.HP}</span></div>
                <div class="derived-card"><span class="derived-label">STA</span><span class="derived-value">${d.STA}</span></div>
                <div class="derived-card">
                    <span class="derived-label">EP Slots</span>
                    <span class="derived-value">${char.epCurrent ?? d.EP}/${d.EP}</span>
                    <button class="btn btn-sm btn-ghost" style="margin-top:0.3rem;font-size:0.7rem" onclick="openEditEPModal()">Edit</button>
                </div>
                <div class="derived-card"><span class="derived-label">AC DEF</span><span class="derived-value">${d.ACDEF}</span></div>
                <div class="derived-card"><span class="derived-label">AC AGL</span><span class="derived-value">${d.ACAGL}</span></div>
                <div class="derived-card"><span class="derived-label">SPL</span><span class="derived-value">${d.SPL.display}</span></div>
            </div>
        </div>

        <div class="sheet-actions">
            <button class="btn btn-secondary" onclick="openEditModal()">Edit Character</button>
        </div>`;
}

function renderStatCard(name, value, label) {
    const mod = getMod(value);
    return `
        <div class="stat-card">
            <div class="stat-name">${name}</div>
            <div class="stat-value">${value}</div>
            <div class="stat-mod ${mod >= 0 ? 'mod-pos' : 'mod-neg'}">${formatMod(mod)}</div>
            ${label ? `<div class="stat-sublabel">${label}</div>` : ''}
        </div>`;
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function renderEmptySheet() {
    document.getElementById('sheetView').innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⚔</div>
            <h3>No Character Found</h3>
            <p>Create your character to begin your journey.</p>
            <button class="btn btn-primary" onclick="openCreateModal()">Create Character</button>
        </div>`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openCreateModal() {
    _pendingCharImage = null;
    populateForm(blankCharacter());
    document.getElementById('modalTitle').textContent = 'Create Character';
    document.getElementById('charModal').classList.add('open');
}

function openEditModal() {
    const char = loadCharacter() || blankCharacter();
    _pendingCharImage = char.image || null;
    populateForm(char);
    document.getElementById('modalTitle').textContent = 'Edit Character';
    document.getElementById('charModal').classList.add('open');
}

function closeModal() { document.getElementById('charModal').classList.remove('open'); }

// ─── EP current edit ──────────────────────────────────────────────────────────
function openEditEPModal() {
    const char = loadCharacter(); if (!char) return;
    const d = deriveStats(char);
    const current = char.epCurrent ?? d.EP;
    setValue('ep-current-input', current);
    const maxEl = document.getElementById('ep-max-display');
    if (maxEl) maxEl.textContent = d.EP;
    document.getElementById('editEPModal').classList.add('open');
}
function closeEditEPModal() { document.getElementById('editEPModal').classList.remove('open'); }
function applyEditEP() {
    const char = loadCharacter(); if (!char) return;
    const val = parseInt(document.getElementById('ep-current-input')?.value);
    if (!isNaN(val)) { char.epCurrent = val; saveCharacter(char); renderSheet(char); }
    closeEditEPModal();
}

// ─── Form populate ────────────────────────────────────────────────────────────
function populateForm(char) {
    const s = char.stats;
    setValue('f-name',      char.name);
    setValue('f-alignment', char.alignment);
    setValue('f-STR', s.STR); setValue('f-AGL', s.AGL); setValue('f-DEF', s.DEF);
    setValue('f-WLL', s.WLL); setValue('f-INT', s.INT);
    setValue('f-PCHA', s.PCHA); setValue('f-NCHA', s.NCHA);
    setValue('f-combatMastering',   char.improvement.combatMastering);
    setValue('f-mentalMastering',   char.improvement.mentalMastering);
    setValue('f-socialInteraction', char.improvement.socialInteraction);
    setValue('f-PPM', char.training.PPM); setValue('f-PPArm', char.training.PPArm);
    setValue('f-PPA', char.training.PPA); setValue('f-PPR',   char.training.PPR);

    populateSelect('f-originFeat', getOriginFeats(), char.originFeat);

    const preview = document.getElementById('char-img-preview');
    if (preview) preview.innerHTML = char.image
        ? `<img src="${char.image}" alt="Character">`
        : `<span class="img-placeholder-text">No image</span>`;

    updatePreview();
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

// ─── Form read ────────────────────────────────────────────────────────────────
function readForm() {
    const g = id => parseInt(document.getElementById(id)?.value) || 0;
    const t = id => document.getElementById(id)?.value?.trim() || '';
    const stats = {
        STR: g('f-STR'), AGL: g('f-AGL'), DEF: g('f-DEF'),
        WLL: g('f-WLL'), INT: g('f-INT'),
        PCHA: g('f-PCHA'), NCHA: g('f-NCHA'),
    };
    const rankResult = calcRankFromStats(stats);
    const existing = loadCharacter();
    return {
        name:       t('f-name'),
        originFeat: t('f-originFeat'),
        alignment:  t('f-alignment'),
        image:      _pendingCharImage,
        rank:       rankResult.rank,
        stats,
        improvement: {
            combatMastering:   g('f-combatMastering'),
            mentalMastering:   g('f-mentalMastering'),
            socialInteraction: g('f-socialInteraction'),
        },
        training: { PPM: g('f-PPM'), PPArm: g('f-PPArm'), PPA: g('f-PPA'), PPR: g('f-PPR') },
        knownCombatStyles: existing?.knownCombatStyles || [],
        knownWeaponStyles: existing?.knownWeaponStyles || [],
        knownCombatMoves:  existing?.knownCombatMoves  || [],
        spells:    existing?.spells    || [],
        weapons:   existing?.weapons   || [],
        shards:    existing?.shards    || {},
        keyItems:  existing?.keyItems  || [],
        items:     existing?.items     || [],
        artifacts: existing?.artifacts || [],
        rankUpFeats:     existing?.rankUpFeats     || [],
        divisionUpFeats: existing?.divisionUpFeats || [],
    };
}

// ─── Live preview ─────────────────────────────────────────────────────────────
function updatePreview() {
    const char = readForm();
    const d = deriveStats(char);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('prev-total', d.statTotal);
    set('prev-CHA',   formatStatWithMod(d.CHA));
    set('prev-HP',    d.HP);
    set('prev-STA',   d.STA);
    set('prev-EP',    d.EP);
    set('prev-ACDEF', d.ACDEF);
    set('prev-ACAGL', d.ACAGL);
    set('prev-SPL',   d.SPL.display);
    const rb = document.getElementById('prev-rank-badge');
    if (rb) { rb.className = `badge badge-rank rank-${getRankLetter(d.rank).toLowerCase()}`; rb.textContent = d.rank; }
}

// ─── Submit ───────────────────────────────────────────────────────────────────
function submitCharForm(e) {
    e.preventDefault();
    const char = readForm();
    if (!char.name) { alert('Character name is required.'); return; }
    saveCharacter(char);
    closeModal();
    document.getElementById('charNameDisplay').textContent = char.name;
    renderSheet(char);
    renderProgressionTab();
    renderStylesTab();
    renderInventorySection();
}

// ─── Image upload ─────────────────────────────────────────────────────────────
function initCharImageUpload() {
    const input = document.getElementById('f-char-image-input');
    if (!input) return;
    input.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        resizeImageFile(file, 400, 0.82, dataUrl => {
            _pendingCharImage = dataUrl;
            const p = document.getElementById('char-img-preview');
            if (p) p.innerHTML = `<img src="${dataUrl}" alt="Character">`;
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INVENTORY — Shards & Key Items (Equipment tab)
// ═══════════════════════════════════════════════════════════════════════════════
function renderInventorySection() {
    const char = loadCharacter();
    const container = document.getElementById('inventorySection');
    if (!container) return;

    const shards  = char?.shards   || {};
    const keyItems= char?.keyItems || [];

    const shardRows = Object.entries(shards).filter(([,v]) => v > 0).map(([mat, qty]) => `
        <div class="inv-row">
            <span class="shard-badge">${mat}</span>
            <span class="inv-qty">×${qty}</span>
        </div>`).join('') || '<div class="placeholder-empty" style="margin-top:0">No shards.</div>';

    const keyRows = keyItems.map((ki, i) => `
        <div class="inv-row">
            <span style="font-weight:600;color:var(--text)">${ki.name}</span>
            <span class="inv-qty">×${ki.quantity}</span>
        </div>`).join('') || '<div class="placeholder-empty" style="margin-top:0">No key items.</div>';

    container.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header">
                <h3>Shards & Key Items</h3>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div>
                    <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.5rem">Shards</div>
                    ${shardRows}
                </div>
                <div>
                    <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:0.5rem">Key Items</div>
                    ${keyRows}
                </div>
            </div>
        </div>`;
}

function openAddShardModal() {
    const mats = getMaterials();
    document.getElementById('invModalTitle').textContent = 'Add Shards';
    document.getElementById('invModalBody').innerHTML = `
        <div class="form-field" style="margin-bottom:0.75rem">
            <label>Material</label>
            <select id="inv-shard-mat">
                ${mats.map(m => `<option value="${m.name}">${m.name}${m.effect ? ' — '+m.effect : ''}</option>`).join('')}
            </select>
        </div>
        <div class="form-field" style="margin-bottom:1rem">
            <label>Quantity to add</label>
            <input type="number" id="inv-shard-qty" min="1" value="1">
        </div>
        <div style="display:flex;gap:0.5rem">
            <button class="btn btn-primary" onclick="confirmAddShard()">Add</button>
            <button class="btn btn-ghost" onclick="closeInventoryAddModal()">Cancel</button>
        </div>`;
    document.getElementById('inventoryAddModal').classList.add('open');
}

function confirmAddShard() {
    const mat = document.getElementById('inv-shard-mat').value;
    const qty = parseInt(document.getElementById('inv-shard-qty').value) || 0;
    if (!mat || qty <= 0) return;
    const char = loadCharacter(); if (!char) return;
    char.shards = char.shards || {};
    char.shards[mat] = (char.shards[mat] || 0) + qty;
    saveCharacter(char);
    closeInventoryAddModal();
    renderInventorySection();
    renderWeaponsSection(); // refresh shard display in weapons
}

function openAddKeyItemModal() {
    document.getElementById('invModalTitle').textContent = 'Add Key Item';
    document.getElementById('invModalBody').innerHTML = `
        <div class="form-field" style="margin-bottom:0.75rem">
            <label>Item Name</label>
            <input type="text" id="inv-ki-name" placeholder="e.g. Ancient Rune">
        </div>
        <div class="form-field" style="margin-bottom:1rem">
            <label>Quantity</label>
            <input type="number" id="inv-ki-qty" min="1" value="1">
        </div>
        <div style="display:flex;gap:0.5rem">
            <button class="btn btn-primary" onclick="confirmAddKeyItem()">Add</button>
            <button class="btn btn-ghost" onclick="closeInventoryAddModal()">Cancel</button>
        </div>`;
    document.getElementById('inventoryAddModal').classList.add('open');
}

function confirmAddKeyItem() {
    const name = document.getElementById('inv-ki-name').value.trim();
    const qty  = parseInt(document.getElementById('inv-ki-qty').value) || 1;
    if (!name) return;
    const char = loadCharacter(); if (!char) return;
    char.keyItems = char.keyItems || [];
    const existing = char.keyItems.find(k => k.name.toLowerCase() === name.toLowerCase());
    if (existing) existing.quantity += qty;
    else char.keyItems.push({ name, quantity: qty });
    saveCharacter(char);
    closeInventoryAddModal();
    renderInventorySection();
}

function closeInventoryAddModal() { document.getElementById('inventoryAddModal').classList.remove('open'); }

function adjustShard(mat, delta) {
    const char = loadCharacter(); if (!char) return;
    char.shards = char.shards || {};
    char.shards[mat] = Math.max(0, (char.shards[mat] || 0) + delta);
    if (char.shards[mat] === 0) delete char.shards[mat];
    saveCharacter(char); renderInventorySection(); renderWeaponsSection();
}

function removeShard(mat) {
    const char = loadCharacter(); if (!char) return;
    delete char.shards[mat];
    saveCharacter(char); renderInventorySection(); renderWeaponsSection();
}

function adjustKeyItem(idx, delta) {
    const char = loadCharacter(); if (!char) return;
    char.keyItems[idx].quantity = Math.max(0, (char.keyItems[idx].quantity || 0) + delta);
    if (char.keyItems[idx].quantity === 0) char.keyItems.splice(idx, 1);
    saveCharacter(char); renderInventorySection();
}

function removeKeyItem(idx) {
    const char = loadCharacter(); if (!char) return;
    char.keyItems.splice(idx, 1);
    saveCharacter(char); renderInventorySection();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAGIC TAB — Spells
// ═══════════════════════════════════════════════════════════════════════════════
let _editingSpellId = null;

function renderMagicTab() {
    const char = loadCharacter();
    const container = document.getElementById('magicContent');
    if (!container) return;
    const spells = char?.spells || [];
    const RANK_COLORS = { D:'var(--rank-d)', C:'var(--rank-c)', B:'var(--rank-b)', A:'var(--rank-a)', S:'var(--rank-s)' };

    container.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header">
                <h3>Spells</h3>
                <button class="btn btn-secondary btn-sm" onclick="openSpellModal(null)">+ Add Spell</button>
            </div>
            ${spells.length === 0
                ? `<div class="placeholder-empty">No spells learned yet.</div>`
                : spells.map(sp => {
                    const rl = getRankLetter(sp.rank || 'D-');
                    return `
                    <div class="spell-card">
                        <div class="spell-card-header">
                            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">
                                <span class="spell-name">${sp.name}</span>
                                <span class="badge badge-rank rank-${rl.toLowerCase()}" style="font-size:0.62rem">${sp.rank}</span>
                                ${sp.class ? `<span class="badge badge-alignment" style="font-size:0.62rem">${sp.class}</span>` : ''}
                                ${sp.holotome ? `<span style="font-size:0.65rem;color:var(--gold-dim);font-style:italic">Holotome</span>` : ''}
                            </div>
                            <div style="display:flex;gap:0.35rem">
                                <button class="btn btn-sm btn-secondary" onclick="openSpellModal('${sp.id}')">Edit</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteSpell('${sp.id}')">Delete</button>
                            </div>
                        </div>
                        ${sp.tags?.length ? `<div class="spell-tags">${sp.tags.map(t=>`<span class="weapon-tag">${t}</span>`).join('')}</div>` : ''}
                        ${sp.effect ? `<div class="spell-effect">${sp.effect}</div>` : ''}
                        ${sp.stats  ? `<div class="spell-stats">${sp.stats}</div>` : ''}
                    </div>`;
                }).join('')}
        </div>`;
}

function openSpellModal(id) {
    _editingSpellId = id;
    const char = loadCharacter();
    const spell = id ? char?.spells?.find(s => s.id === id) : null;
    const isNew = !spell;

    document.getElementById('spellModalTitle').textContent = isNew ? 'Add Spell' : 'Edit Spell';

    populateSelect('sp-class', getSpellClasses(), spell?.class || '');

    setValue('sp-name',  spell?.name   || '');
    setValue('sp-rank',  spell?.rank   || 'D-');
    setValue('sp-effect',spell?.effect || '');
    setValue('sp-stats', spell?.stats  || '');
    const htEl = document.getElementById('sp-holotome');
    if (htEl) htEl.checked = spell?.holotome || false;

    const tagContainer = document.getElementById('sp-tags');
    if (tagContainer) {
        tagContainer.innerHTML = getSpellTags().map(tag => `
            <label class="tag-checkbox">
                <input type="checkbox" value="${tag}" ${spell?.tags?.includes(tag) ? 'checked' : ''}> ${tag}
            </label>`).join('');
    }

    const note = document.getElementById('sp-cost-note');
    if (note) note.textContent = '';
    document.getElementById('spellModal').classList.add('open');
}

function updateSpellCostNote() {
    const rank     = document.getElementById('sp-rank')?.value || 'D-';
    const holotome = document.getElementById('sp-holotome')?.checked || false;
    const ppa      = loadCharacter()?.training?.PPA || 0;
    const cost     = getSpellCost(rank, holotome);
    const isEdit   = !!_editingSpellId;
    const note     = document.getElementById('sp-cost-note');
    if (!note) return;
    if (isEdit) {
        note.textContent = 'Editing existing spell — no PPA cost deducted.';
        note.style.color = 'var(--text-muted)';
    } else {
        const canAfford = ppa >= cost;
        note.textContent = `Cost: ${cost} PPA (you have ${ppa}${canAfford ? '' : ' — not enough!'})`;
        note.style.color = canAfford ? 'var(--text-muted)' : 'var(--danger)';
    }
}

function closeSpellModal() {
    document.getElementById('spellModal').classList.remove('open');
    _editingSpellId = null;
}

function submitSpellForm(e) {
    if (e) e.preventDefault();
    const t = id => document.getElementById(id)?.value?.trim() || '';
    const name     = t('sp-name');
    const rank     = t('sp-rank') || 'D-';
    const cls      = t('sp-class');
    const effect   = t('sp-effect');
    const stats    = t('sp-stats');
    const holotome = document.getElementById('sp-holotome')?.checked || false;
    const tags     = Array.from(document.querySelectorAll('#sp-tags input:checked')).map(i => i.value);

    if (!name) { alert('Spell name is required.'); return; }

    const char = loadCharacter(); if (!char) return;
    char.spells = char.spells || [];

    if (_editingSpellId) {
        const idx = char.spells.findIndex(s => s.id === _editingSpellId);
        if (idx >= 0) {
            char.spells[idx] = { ...char.spells[idx], name, rank, class: cls, effect, stats, holotome, tags };
        }
    } else {
        char.spells.push({ id: Date.now().toString(), name, rank, class: cls, effect, stats, holotome, tags });
    }

    saveCharacter(char);
    closeSpellModal();
    renderMagicTab();
    renderProgressionTab();
}

function deleteSpell(id) {
    const char = loadCharacter(); if (!char) return;
    const sp = char.spells?.find(s => s.id === id);
    if (!sp || !confirm(`Delete spell "${sp.name}"?`)) return;
    char.spells = char.spells.filter(s => s.id !== id);
    saveCharacter(char);
    renderMagicTab();
}

function initSpellForm() {
    document.getElementById('spellForm')?.addEventListener('submit', submitSpellForm);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STYLES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function renderStylesTab() {
    renderCombatStylesPane();
    renderWeaponStylesPane();
}

function renderCombatStylesPane() {
    const char = loadCharacter();
    const container = document.getElementById('styles-combat');
    if (!container) return;
    const known = char?.knownCombatStyles || [];
    container.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header">
                <h3>Combat Styles</h3>
                <button class="btn btn-secondary btn-sm" onclick="openAddStyleModal()">+ Add Style</button>
            </div>
            ${known.length === 0
                ? `<div class="placeholder-empty">No combat styles known.</div>`
                : known.map((s, i) => `
                    <div class="style-entry">
                        <div>
                            <div class="style-name">${s.name || s}</div>
                            ${s.passive ? `<div class="style-passive">${s.passive}</div>` : ''}
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="removeCombatStyle(${i})">Remove</button>
                    </div>`).join('')}
        </div>`;
}

function renderWeaponStylesPane() {
    const char = loadCharacter();
    const container = document.getElementById('styles-weapon');
    if (!container) return;
    const known = char?.knownWeaponStyles || [];
    const WEAPON_STYLE_INFO = {
        'Light': {
            attack: 'Slash/Swing: [AGL]×d6 + AGL',
            reaction: 'Redirect: Roll d20 + DEF + AGL to redirect the attack and move to a better position. Cannot be used on an Undodgeable attack. Cost: Reaction'
        },
        'Heavy': {
            attack: 'Swing/Stab/Bash: [STR]×d6 + STR',
            reaction: 'Contest: Roll d20 + DEF + STR to absorb and overpower an attack. Cannot be used on an Unblockable attack. Cost: Reaction'
        },
        'Ranged': {
            attack: 'Shoot/Throw: [STR or AGL]×d6',
            reaction: 'Reflex: Roll d20 + [PHY Stat] to react and disrupt the enemy\'s momentum. Gain +1 per hit on the attacker (max +3). Cannot choose DEF on Unblockable or AGL on Undodgeable. Cost: Reaction'
        },
    };
    const available = ['Light', 'Heavy', 'Ranged'];
    container.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header">
                <h3>Weapon Styles</h3>
                <div style="display:flex;gap:0.4rem">
                    ${available.filter(ws => !known.includes(ws)).map(ws => `
                        <button class="btn btn-sm btn-secondary" onclick="addWeaponStyleFree('${ws}')">+ ${ws}</button>
                    `).join('')}
                </div>
            </div>
            ${known.length === 0
                ? `<div class="placeholder-empty">No weapon styles trained.</div>`
                : known.map(ws => {
                    const info = WEAPON_STYLE_INFO[ws] || {};
                    return `
                    <div class="style-entry" style="flex-direction:column;align-items:stretch">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div class="style-name">${ws} Style</div>
                            <button class="btn btn-danger btn-sm" onclick="removeWeaponStyle('${ws}')">Remove</button>
                        </div>
                        ${info.attack ? `<div style="font-size:0.82rem;color:var(--gold-dim);margin-top:0.4rem">⚔ ${info.attack}</div>` : ''}
                        ${info.reaction ? `<div style="font-size:0.78rem;color:var(--text-2);margin-top:0.25rem">↩ ${info.reaction}</div>` : ''}
                    </div>`;
                }).join('')}
        </div>`;
}

function addWeaponStyleFree(ws) {
    const char = loadCharacter(); if (!char) return;
    char.knownWeaponStyles = char.knownWeaponStyles || [];
    if (!char.knownWeaponStyles.includes(ws)) char.knownWeaponStyles.push(ws);
    saveCharacter(char); renderWeaponStylesPane(); renderSheet(char);
}

function openAddStyleModal() {
    const styles = getCombatStyles();
    const known  = loadCharacter()?.knownCombatStyles?.map(s => s.name || s) || [];
    const avail  = styles.filter(s => !known.includes(s.name));

    const list = avail.map(s => `
        <div class="admin-list-item" style="flex-direction:column;align-items:stretch;gap:0.3rem;padding:0.6rem 0">
            <div style="font-weight:600">${s.name}</div>
            ${s.passive ? `<div style="font-size:0.78rem;color:var(--text-muted)">${s.passive}</div>` : ''}
            <div style="margin-top:0.3rem">
                <button class="btn btn-primary btn-sm" onclick="addCombatStyleFree('${s.name.replace(/'/g,"\\'")}','${(s.passive||'').replace(/'/g,"\\'").replace(/"/g,"'")}')">
                    Learn
                </button>
            </div>
        </div>`).join('') || `<div class="admin-list-empty">All styles already known, or no styles defined by admin.</div>`;

    openPickerModal('Add Combat Style', list);
}

function addCombatStyleFree(name, passive) {
    const char = loadCharacter(); if (!char) return;
    char.knownCombatStyles = char.knownCombatStyles || [];
    if (!char.knownCombatStyles.find(s => (s.name||s) === name)) {
        char.knownCombatStyles.push({ name, passive });
    }
    saveCharacter(char);
    closePickerModal();
    renderCombatStylesPane();
    renderProgressionTab();
    renderSheet(char);
}

function addCombatStyle(name, passive) {
    const char = loadCharacter(); if (!char) return;
    char.knownCombatStyles = char.knownCombatStyles || [];
    if (!char.knownCombatStyles.find(s => (s.name||s) === name)) {
        char.knownCombatStyles.push({ name, passive });
        saveCharacter(char); renderCombatStylesPane(); renderSheet(char);
    }
}

function removeCombatStyle(idx) {
    const char = loadCharacter(); if (!char) return;
    char.knownCombatStyles.splice(idx, 1);
    saveCharacter(char); renderCombatStylesPane(); renderSheet(char);
}

function toggleWeaponStyle(ws) {
    const char = loadCharacter(); if (!char) return;
    char.knownWeaponStyles = char.knownWeaponStyles || [];
    const idx = char.knownWeaponStyles.indexOf(ws);
    if (idx >= 0) char.knownWeaponStyles.splice(idx, 1);
    else char.knownWeaponStyles.push(ws);
    saveCharacter(char); renderWeaponStylesPane(); renderSheet(char);
}

function removeWeaponStyle(ws) {
    const char = loadCharacter(); if (!char) return;
    char.knownWeaponStyles = char.knownWeaponStyles.filter(s => s !== ws);
    saveCharacter(char); renderWeaponStylesPane(); renderSheet(char);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TECHNIQUES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function renderTechniquesTab() { renderCombatMovesPane(); renderWeaponTechniquesPane(); }

function renderCombatMovesPane() {
    const char = loadCharacter();
    const container = document.getElementById('techniques-combat');
    if (!container) return;
    const known = char?.knownCombatMoves || [];
    const RANK_COLORS = { D:'var(--rank-d)', C:'var(--rank-c)', B:'var(--rank-b)', A:'var(--rank-a)', S:'var(--rank-s)' };

    container.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header">
                <h3>Combat Moves</h3>
                <button class="btn btn-secondary btn-sm" onclick="openAddMoveModal()">+ Add Move</button>
            </div>
            ${known.length === 0
                ? `<div class="placeholder-empty">No combat moves learned.</div>`
                : known.map((m, i) => `
                    <div class="move-entry">
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem">
                            <span class="move-name">${m.name}</span>
                            <span style="font-size:0.7rem;font-weight:700;color:${RANK_COLORS[m.rank]||'var(--text-muted)'}">${m.rank}</span>
                        </div>
                        <div class="move-effect">${m.effect}</div>
                        <div style="display:flex;gap:1rem;margin-top:0.2rem">
                            ${m.stats ? `<span class="move-meta">${m.stats}</span>` : ''}
                            ${m.cost  ? `<span class="move-meta">Cost: ${m.cost} STA</span>` : ''}
                        </div>
                        <button class="btn btn-danger btn-sm" style="margin-top:0.4rem" onclick="removeCombatMove(${i})">Remove</button>
                    </div>`).join('')}
        </div>`;
}

function openAddMoveModal() {
    const moves = getCombatMoves();
    const known = loadCharacter()?.knownCombatMoves?.map(m => m.name) || [];
    const avail = moves.filter(m => !known.includes(m.name));
    const RANK_COLORS = { D:'var(--rank-d)', C:'var(--rank-c)', B:'var(--rank-b)', A:'var(--rank-a)', S:'var(--rank-s)' };

    const list = avail.map((m, i) => {
        const realIdx = moves.indexOf(m);
        return `
        <div class="admin-list-item" style="flex-direction:column;align-items:stretch;gap:0.25rem;padding:0.6rem 0">
            <div style="display:flex;align-items:center;gap:0.4rem">
                <span style="font-weight:600">${m.name}</span>
                <span style="font-size:0.7rem;font-weight:700;color:${RANK_COLORS[m.rank]||'var(--text-muted)'}">${m.rank}</span>
            </div>
            <div style="font-size:0.78rem;color:var(--text-2)">${m.effect}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${m.stats ? m.stats+' · ' : ''}${m.cost ? m.cost+' STA' : ''}</div>
            <div style="margin-top:0.3rem">
                <button class="btn btn-primary btn-sm" onclick="addCombatMoveFree(${realIdx})">Learn</button>
            </div>
        </div>`;
    }).join('') || `<div class="admin-list-empty">No moves available to add.</div>`;

    openPickerModal('Add Combat Move', list);
}

function addCombatMoveFree(moveIdx) {
    const move = getCombatMoves()[moveIdx]; if (!move) return;
    const char = loadCharacter(); if (!char) return;
    char.knownCombatMoves = char.knownCombatMoves || [];
    if (!char.knownCombatMoves.find(m => m.name === move.name)) {
        char.knownCombatMoves.push({ ...move });
    }
    saveCharacter(char);
    closePickerModal();
    renderCombatMovesPane();
    renderProgressionTab();
}

function addCombatMove(idx) {
    const move = getCombatMoves()[idx]; if (!move) return;
    const char = loadCharacter(); if (!char) return;
    char.knownCombatMoves = char.knownCombatMoves || [];
    if (!char.knownCombatMoves.find(m => m.name === move.name)) {
        char.knownCombatMoves.push({ ...move });
        saveCharacter(char); renderCombatMovesPane();
    }
}

function removeCombatMove(idx) {
    const char = loadCharacter(); if (!char) return;
    char.knownCombatMoves.splice(idx, 1);
    saveCharacter(char); renderCombatMovesPane();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WEAPON TECHNIQUES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function renderWeaponTechniquesPane() {
    const char = loadCharacter();
    const container = document.getElementById('weaponTechniquesContent');
    if (!container) return;
    const known = char?.knownWeaponTechniques || [];
    const RANK_COLORS = { D:'var(--rank-d)', C:'var(--rank-c)', B:'var(--rank-b)', A:'var(--rank-a)', S:'var(--rank-s)' };

    container.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header">
                <h3>Weapon Techniques</h3>
                <button class="btn btn-secondary btn-sm" onclick="openAddWeaponTechModal()">+ Add</button>
            </div>
            ${known.length === 0
                ? `<div class="placeholder-empty">No weapon techniques learned.</div>`
                : known.map((m, i) => `
                    <div class="move-entry">
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;flex-wrap:wrap">
                            <span class="move-name">${m.name}</span>
                            <span style="font-size:0.7rem;font-weight:700;color:${RANK_COLORS[m.rank]||'var(--text-muted)'}">${m.rank}</span>
                            ${(m.categories||[]).map(c => `<span class="weapon-tag">${c}</span>`).join('')}
                        </div>
                        ${m.effect ? `<div class="move-effect">${m.effect}</div>` : ''}
                        ${m.stats  ? `<div class="move-meta" style="margin-top:0.2rem">${m.stats}</div>` : ''}
                        <button class="btn btn-danger btn-sm" style="margin-top:0.4rem" onclick="removeWeaponTech(${i})">Remove</button>
                    </div>`).join('')}
        </div>`;
}

function openAddWeaponTechModal() {
    const techs = getWeaponTechniques();
    const known = loadCharacter()?.knownWeaponTechniques?.map(m => m.name) || [];
    const avail = techs.filter(m => !known.includes(m.name));
    const RANK_COLORS = { D:'var(--rank-d)', C:'var(--rank-c)', B:'var(--rank-b)', A:'var(--rank-a)', S:'var(--rank-s)' };

    const list = avail.map((m, i) => {
        const realIdx = techs.indexOf(m);
        return `
        <div class="admin-list-item" style="flex-direction:column;align-items:stretch;gap:0.25rem;padding:0.6rem 0">
            <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">
                <span style="font-weight:600">${m.name}</span>
                <span style="font-size:0.7rem;font-weight:700;color:${RANK_COLORS[m.rank]||'var(--text-muted)'}">${m.rank}</span>
                ${(m.categories||[]).map(c => `<span class="weapon-tag">${c}</span>`).join('')}
            </div>
            ${m.effect ? `<div style="font-size:0.78rem;color:var(--text-2)">${m.effect}</div>` : ''}
            ${m.stats  ? `<div style="font-size:0.72rem;color:var(--text-muted)">${m.stats}</div>` : ''}
            <div style="margin-top:0.3rem">
                <button class="btn btn-primary btn-sm" onclick="learnWeaponTechFree(${realIdx})">Learn</button>
            </div>
        </div>`;
    }).join('') || `<div class="admin-list-empty">No techniques available, or no techniques defined by admin.</div>`;

    openPickerModal('Add Weapon Technique', list);
}

function learnWeaponTechFree(idx) {
    const tech = getWeaponTechniques()[idx]; if (!tech) return;
    const char = loadCharacter(); if (!char) return;
    char.knownWeaponTechniques = char.knownWeaponTechniques || [];
    if (!char.knownWeaponTechniques.find(m => m.name === tech.name)) {
        char.knownWeaponTechniques.push({ ...tech });
    }
    saveCharacter(char);
    closePickerModal();
    renderWeaponTechniquesPane();
}

function removeWeaponTech(idx) {
    const char = loadCharacter(); if (!char) return;
    char.knownWeaponTechniques.splice(idx, 1);
    saveCharacter(char); renderWeaponTechniquesPane();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FEATS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function renderFeatsTab() {
    renderMyFeatsPane();
    renderRankUpFeatsPane();
    renderDivisionUpFeatsPane();
}

function _getFeatKey(type) {
    return type === 'rankUp' ? 'rankUpFeats' : 'divisionUpFeats';
}

function _getEquippedFeats(char, type) {
    return (char?.[_getFeatKey(type)] || []);
}

function _renderFeatPane(containerId, featList, equippedFeats, type) {
    const c = document.getElementById(containerId);
    if (!c) return;

    const equippedHtml = equippedFeats.length === 0
        ? `<div style="font-size:0.82rem;color:var(--text-muted)">None selected yet.</div>`
        : equippedFeats.map((ef, i) => `
            <span class="equipped-feat-tag">
                ${ef.name}${ef.variation ? ` <em style="color:var(--gold-dim)">[${ef.variation}]</em>` : ''}
                <button onclick="removeFeat('${type}',${i})" title="Remove">✕</button>
            </span>`).join('');

    c.innerHTML = `
        <div class="placeholder-section">
            <div class="placeholder-header"><h3>${type === 'rankUp' ? 'Rank Up' : 'Division Up'} Feats</h3></div>
            <div class="equipped-feats-section">
                <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.5rem">Equipped Feats</div>
                <div>${equippedHtml}</div>
            </div>
            <input class="feats-search" type="text" placeholder="Search feats..." oninput="filterFeats('${type}', this.value)">
            <div id="feats-list-${type}">
                ${_renderFeatRows(featList, equippedFeats, type)}
            </div>
        </div>`;
}

function _renderFeatRows(featList, equippedFeats, type) {
    if (featList.length === 0) return `<div class="placeholder-empty">No feats defined by admin yet.</div>`;
    return featList.map((feat, i) => {
        const alreadyEquipped = !feat.multiPick && equippedFeats.some(ef => ef.name === feat.name);
        return `
        <div class="feat-entry" data-feat-name="${feat.name.toLowerCase()}">
            <div class="feat-entry-info">
                <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                    <span class="feat-name">${feat.name}</span>
                    ${feat.multiPick ? `<span style="font-size:0.65rem;color:var(--gold-dim);font-style:italic">[${feat.variationLabel || 'Variation'}]</span>` : ''}
                </div>
                ${feat.passive ? `<div class="feat-passive">${feat.passive}</div>` : ''}
                ${feat.multiPick ? `<input class="feat-variation-input" type="text" id="feat-var-${type}-${i}" placeholder="${feat.variationLabel || 'Enter variation...'}" style="margin-top:0.3rem">` : ''}
            </div>
            <div>
                <button class="btn btn-sm ${alreadyEquipped ? 'btn-ghost' : 'btn-primary'}"
                    ${alreadyEquipped ? 'disabled' : `onclick="equipFeat('${type}',${i})"`}>
                    ${alreadyEquipped ? 'Equipped' : '+ Equip'}
                </button>
            </div>
        </div>`;
    }).join('');
}

function filterFeats(type, query) {
    const rows = document.querySelectorAll(`#feats-list-${type} .feat-entry`);
    const q = query.toLowerCase();
    rows.forEach(row => {
        row.style.display = row.dataset.featName.includes(q) ? '' : 'none';
    });
}

function renderRankUpFeatsPane() {
    const char = loadCharacter();
    const feats = getRankUpFeats();
    const equipped = _getEquippedFeats(char, 'rankUp');
    _renderFeatPane('feats-rankup', feats, equipped, 'rankUp');
}

function renderDivisionUpFeatsPane() {
    const char = loadCharacter();
    const feats = getDivisionUpFeats();
    const equipped = _getEquippedFeats(char, 'divisionUp');
    _renderFeatPane('feats-divisionup', feats, equipped, 'divisionUp');
}

function renderMyFeatsPane() {
    const c = document.getElementById('feats-myfeats');
    if (!c) return;
    const char = loadCharacter();
    const rankUpFeats    = char?.rankUpFeats    || [];
    const divisionUpFeats = char?.divisionUpFeats || [];

    if (rankUpFeats.length === 0 && divisionUpFeats.length === 0) {
        c.innerHTML = `<div class="placeholder-section"><div class="placeholder-empty">No feats equipped yet. Use the Rank Up Feats and Division Up Feats tabs to equip them.</div></div>`;
        return;
    }

    const renderFeatCard = (ef, type, idx) => `
        <div class="feat-entry" style="background:var(--surface-2)">
            <div class="feat-entry-info">
                <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                    <span class="feat-name">${ef.name}${ef.variation ? ` <em style="color:var(--gold-dim)">[${ef.variation}]</em>` : ''}</span>
                </div>
                ${ef.passive ? `<div class="feat-passive">${ef.passive}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-danger" onclick="removeFeat('${type}',${idx})" title="Remove">✕</button>
        </div>`;

    const rankSection = rankUpFeats.length > 0 ? `
        <div class="placeholder-section">
            <div class="placeholder-header"><h3>Rank Up Feats</h3></div>
            ${rankUpFeats.map((ef, i) => renderFeatCard(ef, 'rankUp', i)).join('')}
        </div>` : '';

    const divSection = divisionUpFeats.length > 0 ? `
        <div class="placeholder-section">
            <div class="placeholder-header"><h3>Division Up Feats</h3></div>
            ${divisionUpFeats.map((ef, i) => renderFeatCard(ef, 'divisionUp', i)).join('')}
        </div>` : '';

    c.innerHTML = rankSection + divSection;
}

function equipFeat(type, featIdx) {
    const char = loadCharacter(); if (!char) return;
    const featList = type === 'rankUp' ? getRankUpFeats() : getDivisionUpFeats();
    const feat = featList[featIdx]; if (!feat) return;
    const key = _getFeatKey(type);
    char[key] = char[key] || [];

    if (!feat.multiPick && char[key].some(ef => ef.name === feat.name)) {
        alert('This feat is already equipped.'); return;
    }

    let variation = '';
    if (feat.multiPick) {
        const varInput = document.getElementById(`feat-var-${type}-${featIdx}`);
        variation = varInput ? varInput.value.trim() : '';
        if (!variation) { alert(`Please enter a ${feat.variationLabel || 'variation'} before equipping.`); return; }
    }

    char[key].push({ name: feat.name, passive: feat.passive, variation });
    saveCharacter(char);
    renderFeatsTab();
}

function removeFeat(type, idx) {
    const char = loadCharacter(); if (!char) return;
    const key = _getFeatKey(type);
    char[key] = char[key] || [];
    char[key].splice(idx, 1);
    saveCharacter(char);
    renderFeatsTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════════════════════════════════════════════
let _editingItemIdx = null;
let _pendingArtifactImage = null;

function renderItemsList() {
    const char = loadCharacter();
    const container = document.getElementById('itemsList');
    if (!container) return;
    const items = char?.items || [];
    container.innerHTML = items.length === 0
        ? `<div class="placeholder-empty" style="margin-top:0">No items in inventory.</div>`
        : items.map((it, i) => `
            <div class="inv-row" style="flex-wrap:wrap;gap:0.4rem;padding:0.5rem 0">
                <div style="flex:1;min-width:120px">
                    <div style="font-weight:600;color:var(--text)">${it.name}</div>
                    ${it.desc   ? `<div style="font-size:0.78rem;color:var(--text-2)">${it.desc}</div>` : ''}
                    ${it.effect ? `<div style="font-size:0.75rem;color:var(--gold-dim);font-style:italic">${it.effect}</div>` : ''}
                </div>
                <span class="inv-qty">×${it.quantity}</span>
                <div class="inv-actions">
                    <button class="btn btn-sm btn-primary" onclick="useItem(${i})">Use</button>
                    <button class="btn btn-sm btn-secondary" onclick="openEditItemModal(${i})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="removeItem(${i})">✕</button>
                </div>
            </div>`).join('');
}

function openAddItemModal() {
    _editingItemIdx = null;
    document.getElementById('itemModalTitle').textContent = 'Add Item';
    const sv = id => { const el = document.getElementById(id); if (el) el.value = ''; };
    sv('item-name'); sv('item-desc'); sv('item-effect');
    document.getElementById('item-qty').value = 1;
    const delBtn = document.getElementById('item-delete-btn');
    if (delBtn) delBtn.style.display = 'none';
    document.getElementById('itemAddModal').classList.add('open');
}

function openEditItemModal(idx) {
    const char = loadCharacter(); if (!char) return;
    const it = char.items[idx]; if (!it) return;
    _editingItemIdx = idx;
    document.getElementById('itemModalTitle').textContent = 'Edit Item';
    document.getElementById('item-name').value   = it.name || '';
    document.getElementById('item-desc').value   = it.desc || '';
    document.getElementById('item-effect').value = it.effect || '';
    document.getElementById('item-qty').value    = it.quantity || 1;
    const delBtn = document.getElementById('item-delete-btn');
    if (delBtn) delBtn.style.display = '';
    document.getElementById('itemAddModal').classList.add('open');
}

function deleteEditingItem() {
    if (_editingItemIdx === null) return;
    const char = loadCharacter(); if (!char) return;
    char.items.splice(_editingItemIdx, 1);
    saveCharacter(char);
    closeItemModal();
    renderItemsList();
}
function closeItemModal() { document.getElementById('itemAddModal').classList.remove('open'); }

function confirmAddItem() {
    const name = document.getElementById('item-name').value.trim();
    if (!name) { alert('Item name is required.'); return; }
    const char = loadCharacter(); if (!char) return;
    char.items = char.items || [];
    const desc   = document.getElementById('item-desc').value.trim();
    const effect = document.getElementById('item-effect').value.trim();
    const qty    = parseInt(document.getElementById('item-qty').value) || 1;
    if (_editingItemIdx !== null) {
        char.items[_editingItemIdx] = { name, desc, effect, quantity: qty };
    } else {
        const existing = char.items.find(it => it.name.toLowerCase() === name.toLowerCase());
        if (existing) { existing.quantity += qty; }
        else { char.items.push({ name, desc, effect, quantity: qty }); }
    }
    saveCharacter(char);
    closeItemModal();
    renderItemsList();
}

function useItem(idx) {
    const char = loadCharacter(); if (!char) return;
    const it = char.items[idx]; if (!it) return;
    if (it.quantity <= 0) return;
    it.quantity -= 1;
    if (it.quantity === 0) char.items.splice(idx, 1);
    saveCharacter(char); renderItemsList();
}

function removeItem(idx) {
    const char = loadCharacter(); if (!char) return;
    char.items.splice(idx, 1);
    saveCharacter(char); renderItemsList();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════
let _editingArtifactIdx = null;

function renderArtifactsList() {
    const char = loadCharacter();
    const container = document.getElementById('artifactsList');
    if (!container) return;
    const arts = char?.artifacts || [];
    container.innerHTML = arts.length === 0
        ? `<div class="placeholder-empty" style="margin-top:0">No artifacts found yet.</div>`
        : arts.map((a, i) => `
            <div class="weapon-card" style="margin-bottom:0.6rem">
                <div class="weapon-card-img">
                    ${a.image ? `<img src="${a.image}" alt="${a.name}">` : `<div class="titan-img-placeholder" style="font-size:1.5rem">◈</div>`}
                </div>
                <div class="weapon-card-body">
                    <div class="weapon-card-name">${a.name}</div>
                    ${a.desc      ? `<div style="font-size:0.78rem;color:var(--text-2);margin-bottom:0.2rem">${a.desc}</div>` : ''}
                    ${a.condition ? `<div style="font-size:0.72rem;color:var(--text-muted)">Condition: ${a.condition}</div>` : ''}
                    ${a.passive   ? `<div style="font-size:0.78rem;color:var(--gold-dim);margin-top:0.2rem">Passive: ${a.passive}</div>` : ''}
                    ${a.active    ? `<div style="font-size:0.78rem;color:var(--text-2);margin-top:0.2rem">Active: ${a.active}</div>` : ''}
                </div>
                <div class="weapon-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="openEditArtifactModal(${i})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="removeArtifact(${i})">✕</button>
                </div>
            </div>`).join('');
}

function openAddArtifactModal() {
    _editingArtifactIdx = null;
    _pendingArtifactImage = null;
    document.getElementById('artifactModalTitle').textContent = 'Add Artifact';
    ['art-name','art-desc','art-condition','art-passive','art-active'].forEach(id => setValue(id, ''));
    const p = document.getElementById('art-img-preview');
    if (p) p.innerHTML = `<span class="img-placeholder-text">◈</span>`;
    const delBtn = document.getElementById('art-delete-btn');
    if (delBtn) delBtn.style.display = 'none';
    document.getElementById('artifactAddModal').classList.add('open');
}

function openEditArtifactModal(idx) {
    const char = loadCharacter(); if (!char) return;
    const a = char.artifacts[idx]; if (!a) return;
    _editingArtifactIdx = idx;
    _pendingArtifactImage = a.image || null;
    document.getElementById('artifactModalTitle').textContent = 'Edit Artifact';
    setValue('art-name',      a.name || '');
    setValue('art-desc',      a.desc || '');
    setValue('art-condition', a.condition || '');
    setValue('art-passive',   a.passive || '');
    setValue('art-active',    a.active || '');
    const p = document.getElementById('art-img-preview');
    if (p) p.innerHTML = a.image ? `<img src="${a.image}" alt="${a.name}">` : `<span class="img-placeholder-text">◈</span>`;
    const delBtn = document.getElementById('art-delete-btn');
    if (delBtn) delBtn.style.display = '';
    document.getElementById('artifactAddModal').classList.add('open');
}

function deleteEditingArtifact() {
    if (_editingArtifactIdx === null) return;
    const char = loadCharacter(); if (!char) return;
    if (!confirm('Delete this artifact permanently?')) return;
    char.artifacts.splice(_editingArtifactIdx, 1);
    saveCharacter(char);
    closeArtifactModal();
    renderArtifactsList();
}

function closeArtifactModal() {
    document.getElementById('artifactAddModal').classList.remove('open');
    _editingArtifactIdx = null;
}

function confirmAddArtifact() {
    const name = document.getElementById('art-name').value.trim();
    if (!name) { alert('Artifact name is required.'); return; }
    const char = loadCharacter(); if (!char) return;
    char.artifacts = char.artifacts || [];
    const art = {
        name,
        desc:      document.getElementById('art-desc').value.trim(),
        condition: document.getElementById('art-condition').value.trim(),
        passive:   document.getElementById('art-passive').value.trim(),
        active:    document.getElementById('art-active').value.trim(),
        image:     _pendingArtifactImage,
    };
    if (_editingArtifactIdx !== null) char.artifacts[_editingArtifactIdx] = art;
    else char.artifacts.push(art);
    saveCharacter(char);
    closeArtifactModal();
    renderArtifactsList();
}

function removeArtifact(idx) {
    const char = loadCharacter(); if (!char) return;
    if (!confirm('Remove this artifact?')) return;
    char.artifacts.splice(idx, 1);
    saveCharacter(char); renderArtifactsList();
}

function initArtifactImageUpload() {
    const input = document.getElementById('art-img-input');
    if (!input) return;
    input.addEventListener('change', function(e) {
        const file = e.target.files[0]; if (!file) return;
        resizeImageFile(file, 400, 0.8, dataUrl => {
            _pendingArtifactImage = dataUrl;
            const p = document.getElementById('art-img-preview');
            if (p) p.innerHTML = `<img src="${dataUrl}" alt="Artifact">`;
        });
    });
}
function openPickerModal(title, bodyHTML) {
    document.getElementById('pickerModalTitle').innerHTML = title;
    document.getElementById('pickerModalBody').innerHTML = bodyHTML;
    document.getElementById('pickerModal').classList.add('open');
}
function closePickerModal() { document.getElementById('pickerModal').classList.remove('open'); }

// ═══════════════════════════════════════════════════════════════════════════════
//  PROGRESSION TAB
// ═══════════════════════════════════════════════════════════════════════════════
function renderProgressionTab() {
    const char = loadCharacter();
    const container = document.getElementById('progressionContent');
    if (!container) return;
    if (!char) { container.innerHTML = `<div class="empty-state" style="min-height:30vh"><p>Create a character first.</p></div>`; return; }

    const { stats, improvement, training } = char;
    const d = deriveStats(char);

    const improvGroup = (title, ppKey, statKeys) => {
        const pp = improvement[ppKey];
        const rows = statKeys.map(stat => {
            const isSocial = stat === 'PCHA' || stat === 'NCHA';
            const val  = stat === 'CHA' ? d.CHA : stats[stat];
            const cost = getImprovementCost(val, isSocial);
            const canAfford = cost !== null && pp >= cost;
            return `
            <div class="impr-row">
                <span class="impr-stat">${stat}</span>
                <span class="impr-val">${formatStatWithMod(val)}</span>
                <span class="impr-cost">${cost !== null ? cost + ' PP' : 'N/A'}${isSocial ? ' <small style="color:var(--gold-dim)">½</small>' : ''}</span>
                <button class="btn btn-sm ${canAfford ? 'btn-primary' : 'btn-ghost'}"
                    ${canAfford ? `onclick="spendPP('${ppKey}','${stat}')"` : 'disabled'}>Raise</button>
            </div>`;
        }).join('');
        return `
        <div class="placeholder-section">
            <div class="placeholder-header"><h3>${title}</h3><span class="pp-counter">${pp} PP</span></div>
            <div class="impr-group">${rows}</div>
        </div>`;
    };

    container.innerHTML = `
        <div class="progression-layout">
            <div class="progression-col">
                <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem">
                    <button class="btn btn-secondary btn-sm" onclick="openAddImprPPModal()">+ Add Improvement PP</button>
                </div>
                ${improvGroup('Combat Mastering', 'combatMastering', ['STR','AGL','DEF'])}
                ${improvGroup('Mental Mastering',  'mentalMastering',  ['INT','WLL'])}
                ${improvGroup('Social Interaction','socialInteraction',['PCHA','NCHA'])}
            </div>
            <div class="progression-col">
                <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem">
                    <button class="btn btn-secondary btn-sm" onclick="openAddTrainPPModal()">+ Add Training PP</button>
                </div>

                <!-- Martial Arts PPM -->
                <div class="placeholder-section">
                    <div class="placeholder-header">
                        <h3>Martial Arts Training</h3>
                        <span class="pp-counter">${training.PPM} PPM</span>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">Spend PPM when you learn a Combat Style or Move. Choose what you learned:</div>
                    <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem">
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.25rem">Type</div>
                            <select id="ppm-learn-type" onchange="updatePPMCostDisplay()">
                                <option value="style">Combat Style (300)</option>
                                <option value="move">Combat Move</option>
                            </select>
                        </div>
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.25rem">Rank</div>
                            <select id="ppm-learn-rank" onchange="updatePPMCostDisplay()">
                                <option value="D">D — 60 PPM</option>
                                <option value="C">C — 120 PPM</option>
                                <option value="B">B — 200 PPM</option>
                                <option value="A">A — 300 PPM</option>
                                <option value="S">S — 600 PPM</option>
                            </select>
                        </div>
                        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:var(--text-2);cursor:pointer">
                            <input type="checkbox" id="ppm-holotome" onchange="updatePPMCostDisplay()" style="accent-color:var(--gold)"> Holotome (+50)
                        </label>
                        <button class="btn btn-primary btn-sm" onclick="spendPPMByRank()">Spend</button>
                    </div>
                    <div id="ppm-cost-display" style="font-size:0.78rem;color:var(--text-muted)"></div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">
                        Style: 300 · Move D=${MOVE_COST_PPM.D} · C=${MOVE_COST_PPM.C} · B=${MOVE_COST_PPM.B} · A=${MOVE_COST_PPM.A} · S=${MOVE_COST_PPM.S} PPM (+${HOLOTOME_EXTRA} Holotome)
                    </div>
                </div>

                <!-- Weapons PPArm -->
                <div class="placeholder-section">
                    <div class="placeholder-header">
                        <h3>Weapons Training</h3>
                        <span class="pp-counter">${training.PPArm} PPArm</span>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">Spend PPArm when you learn a Weapon Style or Technique:</div>
                    <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem">
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.25rem">Type</div>
                            <select id="pparm-learn-type" onchange="updatePPArmCostDisplay()">
                                <option value="style">Weapon Style (400)</option>
                                <option value="tech">Weapon Technique</option>
                            </select>
                        </div>
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.25rem">Rank</div>
                            <select id="pparm-learn-rank" onchange="updatePPArmCostDisplay()">
                                <option value="D">D — 80 PPArm</option>
                                <option value="C">C — 160 PPArm</option>
                                <option value="B">B — 250 PPArm</option>
                                <option value="A">A — 400 PPArm</option>
                                <option value="S">S — 800 PPArm</option>
                            </select>
                        </div>
                        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:var(--text-2);cursor:pointer">
                            <input type="checkbox" id="pparm-holotome" onchange="updatePPArmCostDisplay()" style="accent-color:var(--gold)"> Holotome (+50)
                        </label>
                        <button class="btn btn-primary btn-sm" onclick="spendPPArmByRank()">Spend</button>
                    </div>
                    <div id="pparm-cost-display" style="font-size:0.78rem;color:var(--text-muted)"></div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">
                        Style: 400 · Tech D=${MOVE_COST_PPARM.D} · C=${MOVE_COST_PPARM.C} · B=${MOVE_COST_PPARM.B} · A=${MOVE_COST_PPARM.A} · S=${MOVE_COST_PPARM.S} PPArm (+${HOLOTOME_EXTRA} Holotome)
                    </div>
                </div>

                <!-- Spells PPA -->
                <div class="placeholder-section">
                    <div class="placeholder-header">
                        <h3>Spells</h3>
                        <span class="pp-counter">${training.PPA} PPA</span>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">Spend PPA when you learn a new Spell. Spells are added in the <strong>Magic tab</strong>.</div>
                    <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.5rem">
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.25rem">Spell Rank</div>
                            <select id="ppa-learn-rank" onchange="updatePPACostDisplay()">
                                <option value="D">D — 80 PPA</option>
                                <option value="C">C — 160 PPA</option>
                                <option value="B">B — 250 PPA</option>
                                <option value="A">A — 400 PPA</option>
                                <option value="S">S — 800 PPA</option>
                            </select>
                        </div>
                        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;color:var(--text-2);cursor:pointer">
                            <input type="checkbox" id="ppa-holotome" onchange="updatePPACostDisplay()" style="accent-color:var(--gold)"> Holotome (+50)
                        </label>
                        <button class="btn btn-primary btn-sm" onclick="spendPPAByRank()">Spend</button>
                    </div>
                    <div id="ppa-cost-display" style="font-size:0.78rem;color:var(--text-muted)"></div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">
                        D=${SPELL_COST_PPA.D} · C=${SPELL_COST_PPA.C} · B=${SPELL_COST_PPA.B} · A=${SPELL_COST_PPA.A} · S=${SPELL_COST_PPA.S} PPA (+${HOLOTOME_EXTRA} Holotome)
                    </div>
                </div>

                <!-- Reputation PPR -->
                <div class="placeholder-section">
                    <div class="placeholder-header">
                        <h3>Reputation</h3>
                        <span class="pp-counter">${training.PPR} PPR</span>
                    </div>
                    <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.75rem">Reputation can be spent or earned. Use a negative value to gain PPR.</div>
                    <button class="btn btn-secondary btn-sm" onclick="openSpendPPRModal()">Use Reputation</button>
                </div>
            </div>
        </div>`;
}

// ─── Spend PP by rank (Progression tab) ───────────────────────────────────────
function updatePPMCostDisplay() {
    const type = document.getElementById('ppm-learn-type')?.value;
    const rank = document.getElementById('ppm-learn-rank')?.value || 'D';
    const holo = document.getElementById('ppm-holotome')?.checked || false;
    const rankEl = document.getElementById('ppm-learn-rank');
    if (rankEl) rankEl.disabled = (type === 'style');
    const cost = type === 'style' ? getStyleCostPPM(holo) : getMoveCostPPM(rank, holo);
    const ppm = loadCharacter()?.training?.PPM || 0;
    const el = document.getElementById('ppm-cost-display');
    if (el) {
        const canAfford = ppm >= cost;
        el.textContent = `Cost: ${cost} PPM (you have ${ppm}${canAfford ? '' : ' — not enough!'})`;
        el.style.color = canAfford ? 'var(--text-muted)' : 'var(--danger)';
    }
}

function spendPPMByRank() {
    const type = document.getElementById('ppm-learn-type')?.value;
    const rank = document.getElementById('ppm-learn-rank')?.value || 'D';
    const holo = document.getElementById('ppm-holotome')?.checked || false;
    const cost = type === 'style' ? getStyleCostPPM(holo) : getMoveCostPPM(rank, holo);
    const char = loadCharacter(); if (!char) return;
    if ((char.training.PPM || 0) < cost) { alert(`Not enough PPM. Need ${cost}, have ${char.training.PPM || 0}.`); return; }
    const label = type === 'style' ? 'Combat Style' : `Rank ${rank} Move`;
    if (!confirm(`Spend ${cost} PPM for a ${label}${holo ? ' (Holotome)' : ''}?`)) return;
    char.training.PPM -= cost;
    saveCharacter(char);
    renderProgressionTab();
}

function updatePPArmCostDisplay() {
    const type = document.getElementById('pparm-learn-type')?.value;
    const rank = document.getElementById('pparm-learn-rank')?.value || 'D';
    const holo = document.getElementById('pparm-holotome')?.checked || false;
    const rankEl = document.getElementById('pparm-learn-rank');
    if (rankEl) rankEl.disabled = (type === 'style');
    const cost = type === 'style' ? getWeaponStyleCost(holo) : ((MOVE_COST_PPARM[rank] || 80) + (holo ? HOLOTOME_EXTRA : 0));
    const pparm = loadCharacter()?.training?.PPArm || 0;
    const el = document.getElementById('pparm-cost-display');
    if (el) {
        const canAfford = pparm >= cost;
        el.textContent = `Cost: ${cost} PPArm (you have ${pparm}${canAfford ? '' : ' — not enough!'})`;
        el.style.color = canAfford ? 'var(--text-muted)' : 'var(--danger)';
    }
}

function spendPPArmByRank() {
    const type = document.getElementById('pparm-learn-type')?.value;
    const rank = document.getElementById('pparm-learn-rank')?.value || 'D';
    const holo = document.getElementById('pparm-holotome')?.checked || false;
    const cost = type === 'style' ? getWeaponStyleCost(holo) : ((MOVE_COST_PPARM[rank] || 80) + (holo ? HOLOTOME_EXTRA : 0));
    const char = loadCharacter(); if (!char) return;
    if ((char.training.PPArm || 0) < cost) { alert(`Not enough PPArm. Need ${cost}, have ${char.training.PPArm || 0}.`); return; }
    const label = type === 'style' ? 'Weapon Style' : `Rank ${rank} Technique`;
    if (!confirm(`Spend ${cost} PPArm for a ${label}${holo ? ' (Holotome)' : ''}?`)) return;
    char.training.PPArm -= cost;
    saveCharacter(char);
    renderProgressionTab();
}

function updatePPACostDisplay() {
    const rank = document.getElementById('ppa-learn-rank')?.value || 'D';
    const holo = document.getElementById('ppa-holotome')?.checked || false;
    const cost = (SPELL_COST_PPA[rank] || 80) + (holo ? HOLOTOME_EXTRA : 0);
    const ppa = loadCharacter()?.training?.PPA || 0;
    const el = document.getElementById('ppa-cost-display');
    if (el) {
        const canAfford = ppa >= cost;
        el.textContent = `Cost: ${cost} PPA (you have ${ppa}${canAfford ? '' : ' — not enough!'})`;
        el.style.color = canAfford ? 'var(--text-muted)' : 'var(--danger)';
    }
}

function spendPPAByRank() {
    const rank = document.getElementById('ppa-learn-rank')?.value || 'D';
    const holo = document.getElementById('ppa-holotome')?.checked || false;
    const cost = (SPELL_COST_PPA[rank] || 80) + (holo ? HOLOTOME_EXTRA : 0);
    const char = loadCharacter(); if (!char) return;
    if ((char.training.PPA || 0) < cost) { alert(`Not enough PPA. Need ${cost}, have ${char.training.PPA || 0}.`); return; }
    if (!confirm(`Spend ${cost} PPA for a Rank ${rank} Spell${holo ? ' (Holotome)' : ''}?`)) return;
    char.training.PPA -= cost;
    saveCharacter(char);
    renderProgressionTab();
}

// ─── Spend PP ─────────────────────────────────────────────────────────────────
function spendPP(ppKey, statName) {
    const char = loadCharacter(); if (!char) return;
    const isSocial  = statName === 'PCHA' || statName === 'NCHA';
    const currentVal= char.stats[statName];
    const cost = getImprovementCost(currentVal, isSocial);
    if (cost === null) return;
    if (char.improvement[ppKey] < cost) { alert(`Not enough PP. Need ${cost}, have ${char.improvement[ppKey]}.`); return; }
    if (!confirm(`Spend ${cost} PP to raise ${statName} from ${currentVal} to ${currentVal + 1}?`)) return;
    char.stats[statName] += 1;
    char.improvement[ppKey] -= cost;
    char.rank = calcRankFromStats(char.stats).rank;
    saveCharacter(char);
    renderSheet(char);
    renderProgressionTab();
}

// ─── Add Improvement PP modal ─────────────────────────────────────────────────
function openAddImprPPModal() {
    setValue('add-impr-combat', 0);
    setValue('add-impr-mental', 0);
    setValue('add-impr-social', 0);
    document.getElementById('addImprPPModal').classList.add('open');
}
function closeAddImprPPModal() { document.getElementById('addImprPPModal').classList.remove('open'); }

function applyAddImprPP() {
    const g = id => parseInt(document.getElementById(id)?.value) || 0;
    const combat = g('add-impr-combat');
    const mental = g('add-impr-mental');
    const social = g('add-impr-social');
    if (combat + mental + social === 0) { closeAddImprPPModal(); return; }
    const char = loadCharacter(); if (!char) return;
    char.improvement.combatMastering   = (char.improvement.combatMastering   || 0) + combat;
    char.improvement.mentalMastering   = (char.improvement.mentalMastering   || 0) + mental;
    char.improvement.socialInteraction = (char.improvement.socialInteraction || 0) + social;
    saveCharacter(char);
    closeAddImprPPModal();
    renderProgressionTab();
}

// ─── Add Training PP modal ─────────────────────────────────────────────────────
function openAddTrainPPModal() {
    setValue('add-train-ppm',  0);
    setValue('add-train-pparm',0);
    setValue('add-train-ppa',  0);
    setValue('add-train-ppr',  0);
    document.getElementById('addTrainPPModal').classList.add('open');
}
function closeAddTrainPPModal() { document.getElementById('addTrainPPModal').classList.remove('open'); }

function applyAddTrainPP() {
    const g = id => parseInt(document.getElementById(id)?.value) || 0;
    const char = loadCharacter(); if (!char) return;
    char.training.PPM   = (char.training.PPM   || 0) + g('add-train-ppm');
    char.training.PPArm = (char.training.PPArm || 0) + g('add-train-pparm');
    char.training.PPA   = (char.training.PPA   || 0) + g('add-train-ppa');
    char.training.PPR   = (char.training.PPR   || 0) + g('add-train-ppr');
    saveCharacter(char);
    closeAddTrainPPModal();
    renderProgressionTab();
}

// ─── Spend PPR modal ──────────────────────────────────────────────────────────
function openSpendPPRModal() {
    const char = loadCharacter();
    const el = document.getElementById('ppr-current-display');
    if (el) el.textContent = char?.training?.PPR || 0;
    setValue('ppr-spend-amount', '');
    setValue('ppr-spend-reason', '');
    document.getElementById('spendPPRModal').classList.add('open');
}
function closeSpendPPRModal() { document.getElementById('spendPPRModal').classList.remove('open'); }

function confirmSpendPPR() {
    const amount = parseInt(document.getElementById('ppr-spend-amount')?.value) || 0;
    if (amount === 0) { closeSpendPPRModal(); return; }
    const char = loadCharacter(); if (!char) return;
    const newVal = (char.training.PPR || 0) - amount;
    if (newVal < 0 && !confirm(`This will result in negative PPR (${newVal}). Continue?`)) return;
    char.training.PPR = newVal;
    saveCharacter(char);
    closeSpendPPRModal();
    renderProgressionTab();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACCOUNT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function openAccountSettings() {
    const session = getSession();
    setValue('acc-loginName', session?.username || '');
    setValue('acc-newPass', '');
    setValue('acc-confirmPass', '');
    const msg = document.getElementById('acc-msg');
    if (msg) { msg.textContent = ''; msg.className = 'acc-msg'; }
    document.getElementById('accountModal').classList.add('open');
}

function closeAccountSettings() { document.getElementById('accountModal').classList.remove('open'); }

async function saveAccountSettings(e) {
    e.preventDefault();
    const newLogin    = document.getElementById('acc-loginName').value.trim();
    const newPass     = document.getElementById('acc-newPass').value;
    const confirmPass = document.getElementById('acc-confirmPass').value;
    const msgEl       = document.getElementById('acc-msg');

    const showError = msg => { msgEl.textContent = msg; msgEl.className = 'acc-msg error'; };
    const showOk    = msg => { msgEl.textContent = msg; msgEl.className = 'acc-msg success'; };

    if (newPass) {
        if (newPass !== confirmPass) { showError('New passwords do not match.'); return; }
        if (newPass.length < 6)     { showError('Password must be at least 6 characters.'); return; }
        const ok = await sbChangePassword(newPass);
        if (!ok) { showError('Failed to change password. Please try again.'); return; }
    }

    if (newLogin && newLogin.length >= 3) {
        const ok = await sbChangeUsername(newLogin);
        if (!ok) { showError('Username already taken or invalid.'); return; }
    }

    showOk('Settings saved!');
    const updSession = getSession();
    const char = loadCharacter();
    const nameEl = document.getElementById('charNameDisplay');
    if (nameEl) nameEl.textContent = char?.name || updSession?.displayName || '';

    setValue('acc-currentPass', '');
    setValue('acc-newPass', '');
    setValue('acc-confirmPass', '');
    setTimeout(() => { if (msgEl) { msgEl.textContent = ''; } }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════════
function initCharacterPage() {
    const char = loadCharacter();
    const session = getSession();
    const displayName = char?.name || session?.displayName || session?.username || '—';
    const nameEl = document.getElementById('charNameDisplay');
    if (nameEl) nameEl.textContent = displayName;

    if (char) renderSheet(char);
    else renderEmptySheet();

    document.getElementById('charForm')?.addEventListener('submit', submitCharForm);
    const form = document.getElementById('charForm');
    if (form) { form.addEventListener('input', updatePreview); form.addEventListener('change', updatePreview); }
    initCharImageUpload();
    initSpellForm();
    initArtifactImageUpload();

    document.getElementById('accountForm')?.addEventListener('submit', saveAccountSettings);

    renderProgressionTab();
    renderStylesTab();
    renderTechniquesTab();
    renderWeaponTechniquesPane();
    renderMagicTab();
    renderFeatsTab();
    renderInventorySection();
    renderItemsList();
    renderArtifactsList();
}
