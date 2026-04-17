// ─── Per-user storage — backed by Supabase via supabase.js cache ─────────────
function loadTitans() {
    return Array.isArray(window._titansCache) ? JSON.parse(JSON.stringify(window._titansCache)) : [];
}

function saveTitans(titans) {
    window._titansCache = JSON.parse(JSON.stringify(titans));
    sbSaveTitans(titans).catch(e => console.error('saveTitans error', e));
}

function getTitanById(id) {
    return loadTitans().find(t => t.id === id) || null;
}

// ─── Blank titan ──────────────────────────────────────────────────────────────
function blankTitan() {
    return {
        id: Date.now().toString(),
        name: '', type: '', rank: 'D-',
        alignment: 'Neutral',
        size: 'average',
        linkDifficulty: 50,
        baseHP: 30,
        ATK: 0, DEF: 0, AGL: 0, SPL: 0,
        abilities: [],
        traits: '',
        image: null,
        amuletImage: null,
        iconImage: null,
        bp: 0,   // Bound Points
    };
}

// ─── BP / Tier helpers ────────────────────────────────────────────────────────
function getTier(bp) {
    if (bp >= 2500) return 3;
    if (bp >= 1600) return 2;
    if (bp >= 800)  return 1;
    return 0;
}

function getNextTierBP(bp) {
    if (bp < 800)  return 800;
    if (bp < 1600) return 1600;
    if (bp < 2500) return 2500;
    return null; // max tier
}

function tierUpEffect(titanName, newTier) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        background:rgba(201,162,39,0.18);backdrop-filter:blur(4px);
        animation:tierUpFade 3s ease forwards;pointer-events:none;
    `;
    overlay.innerHTML = `
        <div style="font-family:'Cinzel',serif;font-size:2rem;font-weight:700;color:var(--gold);text-shadow:0 0 30px rgba(201,162,39,0.8);text-align:center;padding:2rem">
            ✦ TIER UP ✦
        </div>
        <div style="font-size:1.1rem;color:var(--text);margin-top:0.5rem;text-align:center">
            ${titanName} reached <strong style="color:var(--gold)">Tier ${newTier}</strong>!<br>
            <span style="font-size:0.85rem;color:var(--text-2);margin-top:0.5rem;display:block">Notify your GM to update the titan's kit.</span>
        </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3500);
}

// Inject keyframe if not already present
(function() {
    if (document.getElementById('tier-up-style')) return;
    const s = document.createElement('style');
    s.id = 'tier-up-style';
    s.textContent = `@keyframes tierUpFade { 0%{opacity:0;transform:scale(0.95)} 15%{opacity:1;transform:scale(1)} 80%{opacity:1} 100%{opacity:0} }`;
    document.head.appendChild(s);
})();

// ─── Titan derived stats ──────────────────────────────────────────────────────
const SIZE_BONUS = { small: 1, average: 2, large: 3, colossal: 4 };

function calcTitanDerived(titan, seekerRank) {
    const seekerRankNum = getRankNumber(seekerRank || 'D-');
    const bonus = SIZE_BONUS[titan.size] || 2;
    const HP = titan.baseHP + (seekerRankNum * bonus);
    const AC = 8 + Math.max(titan.AGL, titan.DEF);
    return { HP, AC, seekerRankNum, bonus };
}

function fMod(val) {
    val = parseInt(val) || 0;
    return val >= 0 ? `+${val}` : `${val}`;
}

// ─── Render: titans tab ───────────────────────────────────────────────────────
function renderTitansTab() {
    const titans = loadTitans();
    const char = loadCharacter();
    const container = document.getElementById('titansGrid');
    if (!container) return;

    if (titans.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="min-height:40vh">
                <div class="empty-icon">◈</div>
                <h3>No Titans Bound</h3>
                <p>Your titan collection is empty.</p>
                <button class="btn btn-primary" onclick="openTitanModal()">Bind First Titan</button>
            </div>`;
        return;
    }

    container.innerHTML = titans.map(t => {
        const d = calcTitanDerived(t, char?.rank || 'D-');
        const rl = getRankLetter(t.rank);
        const sizeLabel = t.size.charAt(0).toUpperCase() + t.size.slice(1);
        const bp = t.bp || 0;
        const tier = getTier(bp);
        const nextBP = getNextTierBP(bp);
        const tierColors = ['var(--text-muted)', 'var(--rank-c)', 'var(--rank-b)', 'var(--rank-s)'];
        const tierColor = tierColors[tier] || 'var(--text-muted)';
        return `
        <div class="titan-card" onclick="viewTitan('${t.id}')">
            <div class="titan-card-img">
                ${t.image
                    ? `<img src="${t.image}" alt="${t.name}">`
                    : `<div class="titan-img-placeholder">◈</div>`}
            </div>
            <div class="titan-card-body">
                <div class="titan-card-name">${t.name || 'Unnamed Titan'}</div>
                <div class="titan-card-type">${t.type || '—'}</div>
                <div class="titan-card-badges">
                    <span class="badge badge-rank rank-${rl.toLowerCase()}">${t.rank}</span>
                    <span class="badge badge-weapon">${sizeLabel}</span>
                    <span style="font-size:0.65rem;font-weight:700;color:${tierColor};border:1px solid ${tierColor};padding:0.1rem 0.4rem;border-radius:3px">T${tier}</span>
                </div>
                <div class="titan-card-stats">
                    <span>HP ${d.HP}</span>
                    <span>AC ${d.AC}</span>
                    <span style="color:var(--gold-dim)">${bp} BP</span>
                </div>
                ${nextBP
                    ? `<div class="bp-bar-wrap"><div class="bp-bar-fill" style="width:${Math.min(100, Math.round((bp / nextBP)*100))}%"></div></div><div style="font-size:0.62rem;color:var(--text-muted);margin-top:0.15rem">${bp} / ${nextBP} to Tier ${tier+1}</div>`
                    : `<div style="font-size:0.62rem;color:var(--rank-s);margin-top:0.25rem">Max Tier ✦</div>`}
            </div>
            <div class="titan-card-actions" onclick="event.stopPropagation()">
                <button class="btn btn-secondary btn-sm" onclick="usedInMission('${t.id}')">+ Mission</button>
                <button class="btn btn-ghost btn-sm" onclick="openBPModal('${t.id}')">BP</button>
                <button class="btn btn-secondary btn-sm" onclick="openTitanModal('${t.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteTitan('${t.id}')">Delete</button>
            </div>
        </div>`;
    }).join('');
}

// ─── BP actions ───────────────────────────────────────────────────────────────
function usedInMission(titanId) {
    const titans = loadTitans();
    const t = titans.find(x => x.id === titanId);
    if (!t) return;
    const oldTier = getTier(t.bp || 0);
    t.bp = (t.bp || 0) + 50;
    const newTier = getTier(t.bp);
    saveTitans(titans);
    renderTitansTab();
    if (newTier > oldTier) setTimeout(() => tierUpEffect(t.name, newTier), 200);
}

function openBPModal(titanId) {
    const t = getTitanById(titanId);
    if (!t) return;
    document.getElementById('bp-titan-name').textContent = t.name;
    document.getElementById('bp-current-display').textContent = t.bp || 0;
    document.getElementById('bp-tier-display').textContent = getTier(t.bp || 0);
    document.getElementById('bp-amount-input').value = '';
    document.getElementById('bp-modal-titan-id').value = titanId;
    document.getElementById('bpModal').classList.add('open');
}

function closeBPModal() {
    document.getElementById('bpModal').classList.remove('open');
}

function applyBPChange() {
    const titanId = document.getElementById('bp-modal-titan-id').value;
    const amount  = parseInt(document.getElementById('bp-amount-input').value) || 0;
    if (amount === 0) { closeBPModal(); return; }
    const titans = loadTitans();
    const t = titans.find(x => x.id === titanId);
    if (!t) return;
    const oldTier = getTier(t.bp || 0);
    t.bp = Math.max(0, (t.bp || 0) + amount);
    const newTier = getTier(t.bp);
    saveTitans(titans);
    closeBPModal();
    renderTitansTab();
    if (newTier > oldTier) setTimeout(() => tierUpEffect(t.name, newTier), 200);
}

// ─── View titan sheet ─────────────────────────────────────────────────────────
function viewTitan(id) {
    const titan = getTitanById(id);
    if (!titan) return;
    const char = loadCharacter();
    const d = calcTitanDerived(titan, char?.rank || 'D-');
    const rl = getRankLetter(titan.rank);
    const sizeLabel = titan.size.charAt(0).toUpperCase() + titan.size.slice(1);
    const alignment = titan.alignment || 'Neutral';
    const alignMatch = char?.alignment && char.alignment === alignment;
    const bp = titan.bp || 0;
    const tier = getTier(bp);
    const nextBP = getNextTierBP(bp);
    const tierColors = ['var(--text-muted)', 'var(--rank-c)', 'var(--rank-b)', 'var(--rank-s)'];

    document.getElementById('titanViewContent').innerHTML = `
        <div class="titan-sheet-header">
            <div class="titan-sheet-images">
                <div class="titan-main-img">
                    ${titan.image ? `<img src="${titan.image}" alt="${titan.name}">` : `<div class="titan-img-placeholder large">◈</div>`}
                </div>
                <div class="titan-amulet-imgs">
                    ${titan.amuletImage ? `<img src="${titan.amuletImage}" class="amulet-img" alt="Amulet">` : `<div class="amulet-placeholder">Amulet</div>`}
                    ${titan.iconImage   ? `<img src="${titan.iconImage}"   class="amulet-img" alt="Icon">`   : `<div class="amulet-placeholder">Icon</div>`}
                </div>
            </div>
            <div class="titan-sheet-info">
                <h2 class="char-name">${titan.name || 'Unnamed Titan'}</h2>
                <div class="sheet-badges" style="margin:0.5rem 0">
                    <span class="badge badge-rank rank-${rl.toLowerCase()}">${titan.rank}</span>
                    <span class="badge badge-alignment">${alignment}${alignMatch ? ' ✦' : ''}</span>
                    <span class="badge badge-weapon">${sizeLabel}</span>
                    <span style="font-size:0.7rem;font-weight:700;color:${tierColors[tier]};border:1px solid ${tierColors[tier]};padding:0.15rem 0.5rem;border-radius:4px">Tier ${tier}</span>
                </div>
                <div style="margin:0.6rem 0">
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.3rem">${bp} BP ${nextBP ? `— ${nextBP - bp} to Tier ${tier+1}` : '— Max Tier ✦'}</div>
                    ${nextBP ? `<div class="bp-bar-wrap" style="max-width:220px"><div class="bp-bar-fill" style="width:${Math.min(100, Math.round((bp/nextBP)*100))}%"></div></div>` : ''}
                </div>
                <div class="sheet-header-info" style="padding-top:0.75rem;border-top:1px solid var(--border)">
                    <div class="info-item"><span class="info-label">Type</span><span class="info-value">${titan.type || '—'}</span></div>
                    <div class="info-item"><span class="info-label">Link / STA Cost</span><span class="info-value">${titan.linkDifficulty} on d100</span></div>
                    <div class="info-item"><span class="info-label">Base HP</span><span class="info-value">${titan.baseHP} <small style="color:var(--text-muted)">(+${d.bonus}/rank)</small></span></div>
                </div>
            </div>
        </div>

        <div class="sheet-section" style="margin-top:1rem">
            <h3 class="section-title">Stats <small style="color:var(--text-muted);font-weight:400;font-size:0.65rem">(direct modifiers)</small></h3>
            <div class="stats-grid">
                ${renderTitanModCard('ATK', titan.ATK, 'Attack')}
                ${renderTitanModCard('DEF', titan.DEF)}
                ${renderTitanModCard('AGL', titan.AGL)}
                ${renderTitanModCard('SPL', titan.SPL)}
            </div>
        </div>

        <div class="sheet-section">
            <h3 class="section-title">Derived</h3>
            <div class="derived-grid">
                <div class="derived-card"><span class="derived-label">HP</span><span class="derived-value">${d.HP}</span></div>
                <div class="derived-card"><span class="derived-label">AC</span><span class="derived-value">${d.AC}</span></div>
            </div>
        </div>

        ${titan.abilities.length > 0 ? `
        <div class="sheet-section">
            <h3 class="section-title">Abilities</h3>
            ${titan.abilities.map(a => `
                <div class="ability-entry">
                    <div class="ability-name">${a.name}</div>
                    <div class="ability-effect">${a.effect}</div>
                    ${a.statsText ? `<div class="ability-stats">${a.statsText}</div>` : ''}
                </div>`).join('')}
        </div>` : ''}

        ${titan.traits ? `
        <div class="sheet-section">
            <h3 class="section-title">Traits</h3>
            <p style="color:var(--text-2);font-size:0.9rem;white-space:pre-wrap">${titan.traits}</p>
        </div>` : ''}

        <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem;flex-wrap:wrap;align-items:center">
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteTitan('${titan.id}');closeTitanView()">Delete Titan</button>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                <button class="btn btn-secondary btn-sm" onclick="usedInMission('${titan.id}');closeTitanView()">+ Mission (+50 BP)</button>
                <button class="btn btn-ghost btn-sm" onclick="closeTitanView();openBPModal('${titan.id}')">Adjust BP</button>
                <button class="btn btn-secondary" onclick="closeTitanView();openTitanModal('${titan.id}')">Edit Titan</button>
            </div>
        </div>`;

    document.getElementById('titanViewModal').classList.add('open');
}

function renderTitanModCard(name, val, label) {
    val = parseInt(val) || 0;
    return `
        <div class="stat-card">
            <div class="stat-name">${name}</div>
            <div class="stat-value" style="font-size:1.3rem">${fMod(val)}</div>
            ${label ? `<div class="stat-sublabel">${label}</div>` : ''}
        </div>`;
}

function closeTitanView() {
    document.getElementById('titanViewModal').classList.remove('open');
}

// ─── Titan modal (create / edit) ──────────────────────────────────────────────
let _editingTitanId  = null;
let _pendingTitanImages = { image: null, amuletImage: null, iconImage: null };

function openTitanModal(id) {
    const titan = id ? getTitanById(id) : blankTitan();
    if (!titan) return;
    _editingTitanId = id || null;
    _pendingTitanImages = { image: titan.image, amuletImage: titan.amuletImage, iconImage: titan.iconImage };
    populateTitanForm(titan);
    document.getElementById('titanModalTitle').textContent = id ? 'Edit Titan' : 'Add Titan';
    document.getElementById('titanModal').classList.add('open');
    closeTitanView();
}

function closeTitanModal() {
    document.getElementById('titanModal').classList.remove('open');
    _editingTitanId = null;
}

function populateTitanForm(titan) {
    const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    sv('tf-name', titan.name); sv('tf-type', titan.type); sv('tf-rank', titan.rank);
    sv('tf-alignment', titan.alignment || 'Neutral');
    sv('tf-size', titan.size); sv('tf-linkDifficulty', titan.linkDifficulty);
    sv('tf-baseHP', titan.baseHP);
    sv('tf-ATK', titan.ATK); sv('tf-DEF', titan.DEF);
    sv('tf-AGL', titan.AGL); sv('tf-SPL', titan.SPL);
    sv('tf-traits', titan.traits);
    setImagePreview('titan-img-preview',    titan.image,       '◈');
    setImagePreview('titan-amulet-preview', titan.amuletImage, 'Amulet');
    setImagePreview('titan-icon-preview',   titan.iconImage,   'Icon');
    renderAbilityList(titan.abilities);
    updateTitanPreview();
}

function setImagePreview(previewId, src, placeholder) {
    const el = document.getElementById(previewId);
    if (!el) return;
    el.innerHTML = src
        ? `<img src="${src}" alt="preview">`
        : `<span class="img-placeholder-text">${placeholder}</span>`;
}

function readTitanForm() {
    const g = id => parseInt(document.getElementById(id)?.value) || 0;
    const t = id => document.getElementById(id)?.value?.trim() || '';
    return {
        id: _editingTitanId || Date.now().toString(),
        name: t('tf-name'), type: t('tf-type'), rank: t('tf-rank'),
        alignment: t('tf-alignment') || 'Neutral',
        size: t('tf-size'), linkDifficulty: g('tf-linkDifficulty'), baseHP: g('tf-baseHP'),
        ATK: g('tf-ATK'), DEF: g('tf-DEF'), AGL: g('tf-AGL'), SPL: g('tf-SPL'),
        traits: t('tf-traits'), abilities: readAbilities(),
        image:       _pendingTitanImages.image,
        amuletImage: _pendingTitanImages.amuletImage,
        iconImage:   _pendingTitanImages.iconImage,
        bp: (_editingTitanId ? getTitanById(_editingTitanId)?.bp : null) ?? 0,
    };
}

function submitTitanForm(e) {
    e.preventDefault();
    const titan = readTitanForm();
    if (!titan.name) { alert('Titan name is required.'); return; }
    const titans = loadTitans();
    const idx = titans.findIndex(t => t.id === titan.id);

    if (idx < 0) {
        // New bind — check alignment bonus
        const char = loadCharacter();
        const charAlignment = char?.alignment || '';
        if (charAlignment && titan.alignment && titan.alignment === charAlignment) {
            titan.bp = (titan.bp || 0) + 50;
            alert(`Alignment match! ${titan.name} starts with 50 bonus BP.`);
        }
        titans.push(titan);
    } else {
        titans[idx] = { ...titans[idx], ...titan, bp: titans[idx].bp ?? 0 };
    }
    saveTitans(titans);
    closeTitanModal();
    renderTitansTab();
}

function confirmDeleteTitan(id) {
    const titan = getTitanById(id);
    if (!titan) return;
    if (!confirm(`Delete "${titan.name}"? This cannot be undone.`)) return;
    saveTitans(loadTitans().filter(t => t.id !== id));
    renderTitansTab();
}

// ─── Abilities ────────────────────────────────────────────────────────────────
function renderAbilityList(abilities) {
    const c = document.getElementById('abilitiesList');
    if (!c) return;
    c.innerHTML = abilities.map((a, i) => `
        <div class="ability-form-row" data-idx="${i}">
            <div class="ability-form-inputs">
                <input type="text" placeholder="Ability name"   value="${a.name}"      data-field="name">
                <input type="text" placeholder="Effect"         value="${a.effect}"    data-field="effect">
                <input type="text" placeholder="Stats text"     value="${a.statsText||''}" data-field="statsText">
            </div>
            <button type="button" class="btn btn-danger btn-sm" onclick="removeAbility(${i})">✕</button>
        </div>`).join('');
}

function addAbility() {
    const abilities = readAbilities();
    abilities.push({ name: '', effect: '', statsText: '' });
    renderAbilityList(abilities);
}

function removeAbility(idx) {
    const a = readAbilities(); a.splice(idx, 1); renderAbilityList(a);
}

function readAbilities() {
    return Array.from(document.querySelectorAll('.ability-form-row')).map(row => ({
        name:      row.querySelector('[data-field="name"]')?.value?.trim()      || '',
        effect:    row.querySelector('[data-field="effect"]')?.value?.trim()    || '',
        statsText: row.querySelector('[data-field="statsText"]')?.value?.trim() || '',
    }));
}

// ─── Image upload helpers ─────────────────────────────────────────────────────
function handleTitanImageUpload(inputId, previewId, imageKey, placeholder) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        resizeImageFile(file, 500, 0.8, dataUrl => {
            _pendingTitanImages[imageKey] = dataUrl;
            setImagePreview(previewId, dataUrl, placeholder);
        });
    });
}

function updateTitanPreview() {
    const char = loadCharacter();
    const g = id => parseInt(document.getElementById(id)?.value) || 0;
    const fakeTitan = { DEF: g('tf-DEF'), AGL: g('tf-AGL'), baseHP: g('tf-baseHP'), size: document.getElementById('tf-size')?.value || 'average' };
    const d = calcTitanDerived(fakeTitan, char?.rank || 'D-');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('tprev-HP', d.HP); set('tprev-AC', d.AC);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initTitansPage() {
    renderTitansTab();
    document.getElementById('titanForm')?.addEventListener('submit', submitTitanForm);
    handleTitanImageUpload('tf-image-input',  'titan-img-preview',    'image',       '◈');
    handleTitanImageUpload('tf-amulet-input', 'titan-amulet-preview', 'amuletImage', 'Amulet');
    handleTitanImageUpload('tf-icon-input',   'titan-icon-preview',   'iconImage',   'Icon');
    const form = document.getElementById('titanForm');
    if (form) { form.addEventListener('input', updateTitanPreview); form.addEventListener('change', updateTitanPreview); }
}
