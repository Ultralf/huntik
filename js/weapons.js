// ─── Weapon management ────────────────────────────────────────────────────────
const WEAPON_MAX_DURABILITY = 5;

function getWeapons()    { return loadCharacter()?.weapons  || []; }
function getShards()     { return loadCharacter()?.shards   || {}; }
function getKeyItems()   { return loadCharacter()?.keyItems || []; }

function saveWeapons(weapons) {
    const char = loadCharacter(); if (!char) return;
    char.weapons = weapons; saveCharacter(char);
}

function saveShards(shards) {
    const char = loadCharacter(); if (!char) return;
    char.shards = shards; saveCharacter(char);
}

// ─── Blank weapon ─────────────────────────────────────────────────────────────
function blankWeapon(type) {
    return {
        id: Date.now().toString(),
        type:                  type || 'regular',  // 'regular' | 'special'
        name:                  '',
        material:              '',
        enchantment:           '',
        usageTags:             [],
        weaponTypeTag:         '',
        effect:                '',
        durabilityLeft:        WEAPON_MAX_DURABILITY,  // both regular and special now track durability
        state:                 'normal',  // 'normal' | 'cracked' | 'repairing' | 'restoring'
        repairMissionsLeft:    0,
        restoreMissionsLeft:   0,
        image:                 null,
    };
}

// ─── Render: Equipment > Weapons section ──────────────────────────────────────
let _pendingWeaponImage = null;
let _editingWeaponId    = null;

function renderWeaponsSection() {
    const weapons = getWeapons();
    const container = document.getElementById('weaponsList');
    if (!container) return;

    const durationBar = (left, state) => {
        if (left === null || left === undefined) return '';
        const max = WEAPON_MAX_DURABILITY;
        const dots = Array.from({length: max}, (_, i) =>
            `<span class="dur-dot ${i < left ? 'full' : ''} ${state==='cracked'&&i===0 ? 'cracked' : ''}"></span>`
        ).join('');
        return `<div class="dur-bar">${dots}</div>`;
    };

    const stateTag = state => {
        if (!state || state === 'normal') return '';
        const labels = { cracked: 'CRACKED', repairing: 'IN REPAIR', restoring: 'RESTORING' };
        return `<span class="state-badge ${state}">${labels[state] || state.toUpperCase()}</span>`;
    };

    container.innerHTML = weapons.length === 0 ? `<div class="placeholder-empty" style="margin-top:0.75rem">No weapons in inventory.</div>` :
        weapons.map(w => {
            // Determine action buttons
            let actionBtns = '';
            const isSpecial = w.type === 'special';

            if (w.state === 'repairing') {
                actionBtns = `
                    <span style="font-size:0.75rem;color:var(--text-muted)">${w.repairMissionsLeft} mission(s) left</span>
                    <button class="btn btn-sm btn-secondary" onclick="missionDoneRepairing('${w.id}')">Mission Done</button>`;
            } else if (w.state === 'restoring') {
                actionBtns = `
                    <span style="font-size:0.75rem;color:var(--text-muted)">${w.restoreMissionsLeft} mission(s) left</span>
                    <button class="btn btn-sm btn-secondary" onclick="missionDoneRestoring('${w.id}')">Mission Done</button>`;
            } else if (w.state === 'cracked') {
                if (isSpecial) {
                    actionBtns = `<button class="btn btn-sm btn-secondary" onclick="restoreSpecial('${w.id}')">Restore</button>`;
                } else {
                    actionBtns = `
                        <button class="btn btn-sm btn-ghost" onclick="useMission('${w.id}')" title="Use while cracked — destroys weapon">Use (Destroy)</button>
                        <button class="btn btn-sm btn-secondary" onclick="repairWeapon('${w.id}')">Repair</button>`;
                }
            } else {
                // normal state
                actionBtns = `<button class="btn btn-sm btn-ghost" onclick="useMission('${w.id}')" title="Use in mission (-1 durability)">Use</button>`;
            }

            return `
            <div class="weapon-card ${w.state}">
                <div class="weapon-card-img" onclick="openWeaponDetail('${w.id}')">
                    ${w.image ? `<img src="${w.image}" alt="${w.name}">` : `<div class="titan-img-placeholder" style="font-size:1.5rem">⚔</div>`}
                </div>
                <div class="weapon-card-body">
                    <div class="weapon-card-name">${w.name || '—'}</div>
                    <div class="weapon-card-sub">
                        ${w.material ? `<span>${w.material}</span>` : ''}
                        ${w.enchantment ? `<span>+ ${w.enchantment}</span>` : ''}
                        ${w.effect ? `<span style="color:var(--gold-dim);font-size:0.72rem;font-style:italic">${w.effect}</span>` : ''}
                        ${isSpecial ? `<span class="badge badge-alignment" style="font-size:0.62rem">Special</span>` : ''}
                    </div>
                    <div class="weapon-tags">
                        ${w.weaponTypeTag ? `<span class="weapon-tag type-tag">${w.weaponTypeTag}</span>` : ''}
                        ${w.weaponTypeTag2 ? `<span class="weapon-tag type-tag">${w.weaponTypeTag2}</span>` : ''}
                        ${(w.usageTags||[]).map(t => `<span class="weapon-tag">${t}</span>`).join('')}
                    </div>
                    ${durationBar(w.durabilityLeft, w.state)}
                    ${stateTag(w.state)}
                </div>
                <div class="weapon-card-actions">
                    ${actionBtns}
                    <button class="btn btn-sm btn-danger" onclick="scrapWeapon('${w.id}')">Scrap</button>
                    <button class="btn btn-sm btn-secondary" onclick="openEditWeaponModal('${w.id}')">Edit</button>
                </div>
            </div>`;
        }).join('');
}

// ─── Mission use ──────────────────────────────────────────────────────────────
function useMission(id) {
    const char = loadCharacter(); if (!char) return;
    const w = char.weapons.find(x => x.id === id); if (!w) return;

    if (w.state === 'repairing' || w.state === 'restoring') {
        alert(`"${w.name}" cannot be used right now (${w.state}).`); return;
    }

    if (w.state === 'cracked') {
        if (w.type === 'special') { alert(`"${w.name}" is CRACKED. Restore it before using.`); return; }
        if (!confirm(`"${w.name}" is CRACKED. Using it will DESTROY it permanently. Continue?`)) return;
        char.weapons = char.weapons.filter(x => x.id !== id);
        saveCharacter(char); renderWeaponsSection(); return;
    }

    w.durabilityLeft = Math.max(0, (w.durabilityLeft || 0) - 1);
    if (w.durabilityLeft === 0) {
        w.state = 'cracked';
        const isSpecial = w.type === 'special';
        alert(`"${w.name}" is now CRACKED after this mission. ${isSpecial ? 'Restore it before next use.' : 'Repair it or use it one last time (destroying it).'}`);
    }
    saveCharacter(char); renderWeaponsSection();
}

// ─── Repair (regular) — costs 5 shards, starts 2-mission counter ─────────────
function repairWeapon(id) {
    const char = loadCharacter(); if (!char) return;
    const w = char.weapons.find(x => x.id === id); if (!w || w.state !== 'cracked') return;

    const mat = w.material;
    const cost = 5;
    const shards = char.shards || {};

    if (!mat) { alert('This weapon has no material set and cannot be repaired.'); return; }
    if ((shards[mat] || 0) < cost) {
        alert(`Cannot repair. Need ${cost} ${mat} shards, have ${shards[mat]||0}.`); return;
    }
    if (!confirm(`Spend ${cost} ${mat} shards to send "${w.name}" for repair? It will take 2 missions to complete.`)) return;

    shards[mat] -= cost;
    if (shards[mat] <= 0) delete shards[mat];
    w.state = 'repairing';
    w.repairMissionsLeft = 2;

    char.shards = shards;
    saveCharacter(char); renderWeaponsSection(); renderInventorySection();
}

function missionDoneRepairing(id) {
    const char = loadCharacter(); if (!char) return;
    const w = char.weapons.find(x => x.id === id); if (!w || w.state !== 'repairing') return;
    w.repairMissionsLeft = Math.max(0, (w.repairMissionsLeft || 1) - 1);
    if (w.repairMissionsLeft === 0) {
        w.state = 'normal';
        w.durabilityLeft = WEAPON_MAX_DURABILITY;
        alert(`"${w.name}" has been fully repaired!`);
    }
    saveCharacter(char); renderWeaponsSection();
}

// ─── Restore (special) — free, starts 1-mission counter ──────────────────────
function restoreSpecial(id) {
    const char = loadCharacter(); if (!char) return;
    const w = char.weapons.find(x => x.id === id); if (!w || w.type !== 'special' || w.state !== 'cracked') return;
    if (!confirm(`Send "${w.name}" for restoration? It will take 1 mission to complete.`)) return;
    w.state = 'restoring';
    w.restoreMissionsLeft = 1;
    saveCharacter(char); renderWeaponsSection();
}

function missionDoneRestoring(id) {
    const char = loadCharacter(); if (!char) return;
    const w = char.weapons.find(x => x.id === id); if (!w || w.state !== 'restoring') return;
    w.restoreMissionsLeft = Math.max(0, (w.restoreMissionsLeft || 1) - 1);
    if (w.restoreMissionsLeft === 0) {
        w.state = 'normal';
        w.durabilityLeft = WEAPON_MAX_DURABILITY;
        alert(`"${w.name}" has been fully restored!`);
    }
    saveCharacter(char); renderWeaponsSection();
}

// ─── Scrap ────────────────────────────────────────────────────────────────────
function scrapWeapon(id) {
    const char = loadCharacter(); if (!char) return;
    const w = char.weapons.find(x => x.id === id); if (!w) return;

    if (!w.material) { if (!confirm(`Scrap "${w.name}"? No material set, you won't get any shards.`)) return; }
    else { if (!confirm(`Scrap "${w.name}" for 5 ${w.material} shards?`)) return; }

    if (w.material) {
        char.shards = char.shards || {};
        char.shards[w.material] = (char.shards[w.material] || 0) + 5;
    }
    char.weapons = char.weapons.filter(x => x.id !== id);
    saveCharacter(char); renderWeaponsSection(); renderInventorySection();
}

// ─── Add / Edit weapon modal ──────────────────────────────────────────────────
function openAddWeaponModal() {
    openWeaponTypeDialog('add');
}

function openCraftWeaponModal() {
    openWeaponTypeDialog('craft');
}

function openWeaponTypeDialog(mode) {
    document.getElementById('weaponTypeDialogMode').value = mode;
    document.getElementById('weaponTypeDialog').classList.add('open');
}

function closeWeaponTypeDialog() {
    document.getElementById('weaponTypeDialog').classList.remove('open');
}

function selectWeaponType(type) {
    const mode = document.getElementById('weaponTypeDialogMode').value;
    closeWeaponTypeDialog();
    if (mode === 'add')   openWeaponFormModal(type, null);
    if (mode === 'craft') openCraftFlowModal(type);
}

function openEditWeaponModal(id) {
    const w = getWeapons().find(x => x.id === id);
    if (!w) return;
    openWeaponFormModal(w.type, w);
}

function openWeaponFormModal(type, weapon) {
    _editingWeaponId    = weapon?.id || null;
    _pendingWeaponImage = weapon?.image || null;

    document.getElementById('weaponFormTitle').textContent = weapon ? 'Edit Weapon' : `Add ${type === 'special' ? 'Special' : 'Regular'} Weapon`;
    document.getElementById('wf-type').value = type;

    const effectRow = document.getElementById('wf-effect-row');
    if (effectRow) effectRow.style.display = type === 'special' ? '' : 'none';

    const durNote = document.getElementById('wf-dur-note');
    if (durNote) durNote.style.display = type === 'regular' ? '' : 'none';
    const mats = getMaterials();
    populateSelect('wf-material',    mats,                 weapon?.material);
    populateSelect('wf-enchantment', getEnchantments(),    weapon?.enchantment);

    // Weapon type tag — primary + optional secondary
    renderWeaponTypeTagSelects(weapon?.weaponTypeTag || '', weapon?.weaponTypeTag2 || '');

    // Usage tags checkboxes
    renderUsageTagCheckboxes(getUsageTags(), weapon?.usageTags || []);

    const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    sv('wf-name',    weapon?.name    || '');
    sv('wf-effect',  weapon?.effect  || '');

    // Show material effect hint
    updateMaterialEffectHint();

    const p = document.getElementById('wf-img-preview');
    if (p) p.innerHTML = weapon?.image ? `<img src="${weapon.image}" alt="Weapon">` : `<span class="img-placeholder-text">⚔</span>`;

    document.getElementById('weaponFormModal').classList.add('open');
}

function renderWeaponTypeTagSelects(primary, secondary) {
    const c = document.getElementById('wf-weapon-type-container');
    if (!c) return;
    const tags = getWeaponTypeTags();
    const makeSelect = (id, selectedVal, onchange) => {
        const opts = `<option value="">— None —</option>` + tags.map(t =>
            `<option value="${t}" ${t === selectedVal ? 'selected' : ''}>${t}</option>`).join('');
        return `<select id="${id}" onchange="${onchange}" style="flex:1">${opts}</select>`;
    };
    c.innerHTML = `
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
            ${makeSelect('wf-weaponType', primary, 'renderWeaponTypeTag2()')}
            ${primary ? makeSelect('wf-weaponType2', secondary, '') : ''}
        </div>`;
}

function renderWeaponTypeTag2() {
    const primary = document.getElementById('wf-weaponType')?.value || '';
    renderWeaponTypeTagSelects(primary, '');
}

function updateMaterialEffectHint() {
    const matEl = document.getElementById('wf-material');
    const hintEl = document.getElementById('wf-material-hint');
    if (!matEl || !hintEl) return;
    const matName = matEl.value;
    const mat = getMaterials().find(m => m.name === matName);
    hintEl.textContent = mat?.effect ? mat.effect : '';
}

function closeWeaponFormModal() {
    document.getElementById('weaponFormModal').classList.remove('open');
    _editingWeaponId = null;
}

function renderUsageTagCheckboxes(tags, selected) {
    const c = document.getElementById('wf-usage-tags');
    if (!c) return;
    c.innerHTML = tags.map(tag => `
        <label class="tag-checkbox">
            <input type="checkbox" value="${tag}" ${selected.includes(tag) ? 'checked' : ''}> ${tag}
        </label>`).join('');
}

function submitWeaponForm(e) {
    e.preventDefault();
    const t = id => document.getElementById(id)?.value?.trim() || '';
    const type = t('wf-type');
    const usageTags = Array.from(document.querySelectorAll('#wf-usage-tags input:checked')).map(i => i.value);

    const weapon = {
        id:            _editingWeaponId || Date.now().toString(),
        type,
        name:          t('wf-name'),
        material:      t('wf-material'),
        enchantment:   t('wf-enchantment'),
        usageTags,
        weaponTypeTag:  t('wf-weaponType'),
        weaponTypeTag2: t('wf-weaponType2'),
        effect:        type === 'special' ? t('wf-effect') : '',
        durabilityLeft: WEAPON_MAX_DURABILITY,
        state:         'normal',
        repairMissionsLeft:  0,
        restoreMissionsLeft: 0,
        image:         _pendingWeaponImage,
    };
    if (!weapon.name) { alert('Weapon name is required.'); return; }

    const char = loadCharacter(); if (!char) return;
    char.weapons = char.weapons || [];
    if (_editingWeaponId) {
        const idx = char.weapons.findIndex(w => w.id === _editingWeaponId);
        if (idx >= 0) {
            // Preserve durability/state when editing
            weapon.durabilityLeft      = char.weapons[idx].durabilityLeft;
            weapon.state               = char.weapons[idx].state;
            weapon.repairMissionsLeft  = char.weapons[idx].repairMissionsLeft || 0;
            weapon.restoreMissionsLeft = char.weapons[idx].restoreMissionsLeft || 0;
            char.weapons[idx] = weapon;
        }
    } else {
        char.weapons.push(weapon);
    }
    saveCharacter(char);
    closeWeaponFormModal();
    renderWeaponsSection();
}

// ─── Craft flow ───────────────────────────────────────────────────────────────
function openCraftFlowModal(type) {
    const char = loadCharacter(); if (!char) return;
    const shards = char.shards || {};
    const container = document.getElementById('craftContent');
    document.getElementById('craftFlowTitle').textContent = `Craft ${type === 'special' ? 'Special' : 'Regular'} Weapon`;
    document.getElementById('wc-type').value = type;

    if (type === 'regular') {
        const materials = getMaterials().filter(m => (shards[m.name] || 0) >= 10);
        container.innerHTML = materials.length === 0
            ? `<p style="color:var(--text-muted)">You need at least 10 shards of a material to craft a regular weapon.<br><br>Your shards: ${
                Object.entries(shards).map(([k,v]) => `${k}: ${v}`).join(', ') || 'none'}</p>`
            : `<p style="color:var(--text-2);font-size:0.85rem;margin-bottom:1rem">Select a material (costs 10 shards):</p>` +
              materials.map(m => `
                <div class="craft-material-row" onclick="craftRegular('${m.name}')">
                    <div>
                        <div style="font-weight:600">${m.name}</div>
                    </div>
                    <span class="shard-badge">${shards[m.name]} shards</span>
                </div>`).join('');
    } else {
        const recipes = getSpecialRecipes();
        container.innerHTML = recipes.length === 0
            ? `<p style="color:var(--text-muted)">No special weapon recipes defined by the GM.</p>`
            : recipes.map((r, i) => {
                const canCraft = checkRecipeIngredients(r, char);
                return `
                <div class="craft-material-row ${canCraft ? '' : 'disabled'}">
                    <div>
                        <div style="font-weight:600">${r.name}</div>
                        <div style="font-size:0.78rem;color:var(--text-2)">${r.ingredients.map(ing => `${ing.qty}× ${ing.type==='shard'?ing.material+' Shard':ing.name}`).join(', ')}</div>
                    </div>
                    ${canCraft
                        ? `<button class="btn btn-primary btn-sm" onclick="craftSpecial(${i})">Craft</button>`
                        : `<span style="font-size:0.75rem;color:var(--danger)">Missing ingredients</span>`}
                </div>`;}).join('');
    }
    document.getElementById('craftFlowModal').classList.add('open');
}

function closeCraftFlowModal() { document.getElementById('craftFlowModal').classList.remove('open'); }

function checkRecipeIngredients(recipe, char) {
    const shards   = char.shards   || {};
    const keyItems = char.keyItems || [];
    for (const ing of recipe.ingredients) {
        if (ing.type === 'shard') {
            if ((shards[ing.material] || 0) < ing.qty) return false;
        } else {
            const ki = keyItems.find(k => k.name === ing.name);
            if (!ki || ki.quantity < ing.qty) return false;
        }
    }
    return true;
}

function craftRegular(materialName) {
    const char = loadCharacter(); if (!char) return;
    const cost = 10;
    if ((char.shards[materialName] || 0) < cost) { alert(`Need ${cost} ${materialName} shards.`); return; }
    if (!confirm(`Craft a regular weapon using 10 ${materialName} shards?`)) return;

    char.shards[materialName] -= cost;
    if (char.shards[materialName] <= 0) delete char.shards[materialName];
    saveCharacter(char);
    closeCraftFlowModal();
    renderInventorySection();
    // Open form pre-filled with material
    _editingWeaponId = null;
    openWeaponFormModal('regular', null);
    document.getElementById('wf-material').value = materialName;
}

function craftSpecial(recipeIdx) {
    const recipe = getSpecialRecipes()[recipeIdx]; if (!recipe) return;
    const char = loadCharacter(); if (!char) return;
    if (!checkRecipeIngredients(recipe, char)) { alert('Missing ingredients.'); return; }
    if (!confirm(`Craft "${recipe.name}"? This will consume the required ingredients.`)) return;

    // Deduct ingredients
    char.shards   = char.shards   || {};
    char.keyItems = char.keyItems || [];
    for (const ing of recipe.ingredients) {
        if (ing.type === 'shard') {
            char.shards[ing.material] = (char.shards[ing.material] || 0) - ing.qty;
            if (char.shards[ing.material] <= 0) delete char.shards[ing.material];
        } else {
            const ki = char.keyItems.find(k => k.name === ing.name);
            if (ki) { ki.quantity -= ing.qty; if (ki.quantity <= 0) char.keyItems = char.keyItems.filter(k => k !== ki); }
        }
    }
    saveCharacter(char);
    closeCraftFlowModal();
    renderInventorySection();
    openWeaponFormModal('special', null);
    document.getElementById('wf-name').value = recipe.name;
}

function openWeaponDetail(id) {
    // Placeholder for future detailed view
    openEditWeaponModal(id);
}

// ─── Weapon image upload ──────────────────────────────────────────────────────
function initWeaponImageUpload() {
    const input = document.getElementById('wf-img-input');
    if (!input) return;
    input.addEventListener('change', function(e) {
        const file = e.target.files[0]; if (!file) return;
        resizeImageFile(file, 400, 0.8, dataUrl => {
            _pendingWeaponImage = dataUrl;
            const p = document.getElementById('wf-img-preview');
            if (p) p.innerHTML = `<img src="${dataUrl}" alt="Weapon">`;
        });
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initWeaponsSection() {
    renderWeaponsSection();
    document.getElementById('weaponForm')?.addEventListener('submit', submitWeaponForm);
    initWeaponImageUpload();
}
