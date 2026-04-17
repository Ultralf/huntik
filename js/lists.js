// ─── Admin-managed lists ──────────────────────────────────────────────────────
const LISTS_KEY = 'huntik_lists';

const DEFAULT_LISTS = {
    // Objects with name + passive
    originFeats: [
        { name: 'Tough Skin',       passive: 'Gain +1 AC when not wearing heavy armor.' },
        { name: 'Quick Reflexes',   passive: 'Advantage on initiative rolls.' },
        { name: 'Iron Will',        passive: '+5 STA at start of each session.' },
        { name: 'Sharp Mind',       passive: '+1 to all INT-based checks.' },
        { name: 'Silver Tongue',    passive: '+2 to all CHA-based checks.' },
        { name: 'Eagle Eye',        passive: 'Can detect hidden enemies within 30ft.' },
    ],
    // Objects with name + passive
    combatStyles: [
        { name: 'Krav Maga',          passive: 'When you perform a disarm or counter-attack, you may do so as a bonus action once per combat.' },
        { name: 'Capoeira',           passive: 'You may use AGL instead of STR for unarmed strikes, and dodge attempts cost -2 STA.' },
        { name: 'Boxer (Brawler)',    passive: 'Trained fists count as weapons. Unarmed punch attacks deal +2 damage.' },
        { name: 'Streetwise Method', passive: 'Once per combat, you may read an opponent: gain +1 to hit against them until the start of your next turn.' },
        { name: 'Pencak Silat',      passive: 'When an enemy misses you with a melee attack, you may use your reaction to attempt a grapple at advantage.' },
        { name: 'Systema',           passive: 'You have advantage on saves to resist being frightened or stunned.' },
    ],
    // Objects with name, rank, effect, stats, cost
    combatMoves: [
        { name: 'Disarm Fist',           rank: 'D', effect: 'Quick unarmed strike aimed at the opponent\'s weapon hand.',           stats: 'ATK: base — On hit: STR DC 8 or drop weapon', cost: 4 },
        { name: 'Tactical Feint',        rank: 'D', effect: 'Mislead an opponent with a fake movement to open up their guard.',     stats: 'No ATK — Next attack against this target has advantage', cost: 3 },
        { name: 'Low Blow',             rank: 'C', effect: 'A dirty strike targeting a vulnerable area below the guard.',           stats: 'ATK: +1 — On hit: DEF DC 8 or lose Reaction until end of their turn', cost: 7 },
        { name: 'Biu Sau',              rank: 'C', effect: 'Finger-tip thrust targeting nerve points and gaps in the defense.',     stats: 'ATK: base, ignores 2 AC', cost: 8 },
        { name: 'Meia Lua de Compasso', rank: 'B', effect: 'Spinning heel kick with wide arc, hitting all adjacent targets.',       stats: 'ATK: +2, AoE (all adjacent)', cost: 12 },
        { name: 'Cross',                rank: 'B', effect: 'Powerful rear-hand straight punch delivered with full body rotation.',  stats: 'ATK: +3', cost: 10 },
    ],
    // Objects with name + effect
    materials: [
        { name: 'Iron',           effect: 'Standard material. No special properties.' },
        { name: 'Steel',          effect: 'Reinforced iron. More durable alloy.' },
        { name: 'Bronze',         effect: 'Older alloy. Slightly heavier, but resistant.' },
        { name: 'Silver',         effect: 'Effective against supernatural creatures.' },
        { name: 'Obsidian',       effect: 'Volcanic glass. Extremely sharp but brittle.' },
        { name: 'Aether Steel',   effect: 'Spiritual Resonance: When this weapon hits a titan, it deals the titan\'s d2 Rank as extra damage.' },
        { name: 'Yggdrasil Wood', effect: 'Spores: When this weapon hits a target twice or more, a toxin causes the Slow effect on the target.' },
        { name: 'Atlantis Quartz',effect: 'Charge Up: Use Bonus Action + 12 STA to load the weapon on a hit — deals an additional 2d6 damage on that attack.' },
        { name: 'Dinosaur Bone',  effect: 'Primitive Durability: Any DEF rolls the user does where it\'s possible to use this weapon, roll with a +1.' },
        { name: 'Amber Fossil',   effect: 'Harder, Better: Any STR rolls the user does where it\'s possible to use this weapon, roll with a +1.' },
        { name: 'Titanium',       effect: 'Faster, Stronger: Any AGL rolls the user does where it\'s possible to use this weapon, roll with a +1.' },
        { name: 'Dragonglass (Obsidian)', effect: 'Frozen Fire: Use the bonus action to change the weapon\'s temperature to either 150°C or -20°C.' },
        { name: 'Hallowed Silver',effect: 'Repellent: The user is immune to dark conditions of Rank C+ or less titans.' },
        { name: 'Rune Bronze',    effect: 'Conductor: This weapon can conduct electricity and other conductive energies, absorbing and storing them until next contact.' },
        { name: 'Dracula\'s Fang',effect: 'Blood Absorption: Once per turn, if the weapon deals damage, recover +2 HP (target alive) or +4 STA (titan target).' },
        { name: 'Vibranium',      effect: 'Shockwave Absorption: Advantage to resist being pushed, knocked prone or disarmed.' },
        { name: 'ManaStone',      effect: 'Energy Flow: The user can cast all spells using the weapon as the shooting point.' },
    ],
    // Objects with name + effect
    enchantments: [
        { name: 'Sharpness', effect: '+1 to all attack rolls made with this weapon.' },
        { name: 'Swift',     effect: '-2 STA cost on all attacks.' },
        { name: 'Returning', effect: 'Ranged weapon returns to hand after throw.' },
        { name: 'Runic',     effect: 'Counts as a magical weapon.' },
        { name: 'Slow',      effect: 'The target must pass an AGL DC 8 test or the Slow effect is applied.' },
        { name: 'Weak',      effect: 'The target must pass a WLL DC 8 test or the Weak effect is applied.' },
        { name: 'Silence',   effect: 'The target must pass an INT DC 6 test or the Silence effect is applied.' },
        { name: 'Cursed',    effect: 'The target must pass a SPL DC 8 test or the Cursed effect is applied.' },
        { name: 'Burned',    effect: 'The target must pass a DEF DC 8 test or the Burned effect is applied.' },
        { name: 'Poison',    effect: 'The target must pass a DEF DC 8 test or the Poison effect is applied.' },
        { name: 'Bleeding',  effect: 'After hitting an attack, the user can choose to deal only half damage but apply a stack of Bleeding.' },
    ],
    // Arrays of strings (name only)
    usageTags:      ['One-Handed', 'Two-Handed', 'Versatile', 'Shield', 'Dual Wield', 'Flexible'],
    weaponTypeTags: ['Blade', 'Impact', 'Reach', 'Long Range'],
    // Special weapon recipes
    specialRecipes: [
        // { name: 'Runed Blade', ingredients: [{ type:'shard', material:'Steel', qty:15 }, { type:'shard', material:'Silver', qty:5 }] }
    ],
    // Spell classes (admin-managed)
    spellClasses: ['Anti-magic', 'Blade', 'Bolt', 'Bubble', 'Conjuring', 'Explosive', 'Fist', 'Healing', 'Illusory', 'Mental', 'Portal', 'Power-up', 'Protective', 'Restrictive', 'Sensory', 'Speed', 'Stream', 'Traps', 'Unique', 'Titan', 'Technical'],
    // Spell tags (admin-managed checklist)
    spellTags: ['Action', 'Bonus Action', 'Reaction', 'Concentration', 'Technical', 'Titan Manifestation', 'Passive', 'Persistent'],
    // Weapon techniques (name, rank, categories, effect, stats)
    weaponTechniques: [
        { name: 'Hilt Bash', rank: 'D', categories: ['Blade'], effect: 'Bash the target with the hilt of your blade. Bonus Action. Target must pass a DC 8 + STR save or be Dazed.', stats: 'No ATK roll — DC 8+STR Daze save', cost: 6 },
    ],
    // Rank Up Feats (awarded on each rank increment, e.g. D- → D)
    rankUpFeats: [
        { name: '[Spell Type] Optimization', passive: 'Reduces Cost of spells of the matching type by 1 STA per rank division.', multiPick: true, variationLabel: 'Spell Type' },
        { name: '[Spell Type] Empowerment', passive: 'Increases damage output of spells of the matching type by +[SPL x 2].', multiPick: true, variationLabel: 'Spell Type' },
        { name: '[Spell Type] Focus', passive: 'Increases accuracy/difficulty of the save of spells of the matching type: +1 to hit and +2 to Saving Throws caused by the spell.', multiPick: true, variationLabel: 'Spell Type' },
        { name: 'Favored Enemy', passive: 'When attacking a titan of the selected type, you gain +1 to hit and a damage boost of +5 damage.', multiPick: true, variationLabel: 'Titan Type' },
        { name: 'Favored Alliance', passive: 'Titans you own of the selected type have their cost reduced starting at 3 STA and increasing with each division (D=-3 STA | C=-6 STA | B=-9 STA | A=-12 STA | S=-15 STA).', multiPick: true, variationLabel: 'Titan Type' },
        { name: 'Lightening Technique', passive: 'Slightly increases AGL when dodging various attacks in the same round. After dodging an attack, gain +1 AGL until the start of your turn (can only stack until +2 AGL).', multiPick: false },
        { name: 'Stance Flicker', passive: 'You can swap between mastered combat styles without using your BA once per turn (also applies to mastered weapon styles).', multiPick: false },
        { name: 'Quick Swap', passive: 'You may switch weapons without using your BA once per turn. You may also switch the way you hold a versatile weapon without using your BA instead.', multiPick: false },
        { name: 'Power Throw', passive: 'You can add part of your STR to a throwing weapon attack roll. To hit: roll d20 + [AGL + (STR/2 rounded up)].', multiPick: false },
        { name: 'Alert', passive: '+5 to initiative, can\'t be surprised.', multiPick: false },
        { name: 'Second Wind', passive: 'Once per session, you regain 20 STA by using your BA.', multiPick: false },
        { name: 'Reckless Attack', passive: 'Once per combat, you can make your attack have advantage, however the next attack against you also gets advantage.', multiPick: false },
        { name: 'Brutalization', passive: 'When hitting a critical hit, you get 1 additional dice of the same type you\'re already rolling (if rolling multiple dice, add one on the smallest one).', multiPick: false },
        { name: 'Frenzy', passive: 'When your HP drops below 30%, you get an extra Action on your next turn. (Once per session)', multiPick: false },
        { name: 'Blast Through', passive: 'When succeeding on a defensive STR roll to tank through an attack, you can also use ranged actions.', multiPick: false },
        { name: 'Spell Fortress', passive: 'Once per battle, the first defensive spell used as a reaction doesn\'t consume reaction and costs half STA.', multiPick: false },
        { name: 'Mind Fortress', passive: 'Get +2 when trying to maintain concentration.', multiPick: false },
        { name: 'Trained Physique', passive: '+2 STA per rank increase.', multiPick: false },
        { name: 'Jack of all Defense', passive: '+1 to both AC types.', multiPick: false },
        { name: 'Agile Defense', passive: '+2 to AGL AC.', multiPick: false },
        { name: 'Solid Defense', passive: '+2 to DEF AC.', multiPick: false },
        { name: 'Dueling', passive: 'When using a one-handed weapon, gain a small damage boost against titans: [+Phy Mod x2] extra damage.', multiPick: false },
        { name: 'Great Weapon Fighting', passive: 'When using a two-handed weapon and you roll a 1 or a 2 on a damage die, you may reroll them, using the new value no matter what it is.', multiPick: false },
        { name: 'Interception', passive: 'When an ally near you is hit by an attack, you may place your shield or other acceptable object to block 25% of the damage, consuming your reaction.', multiPick: false },
        { name: 'Protection', passive: 'When an ally near you is being attacked, if you\'re wielding a shield, you may use your reaction to impose disadvantage on the attack (must be declared before the opponent rolls).', multiPick: false },
        { name: 'Dual-Wielding Speed', passive: 'When dual wielding, once per combat, you may do your second attack without consuming your bonus action. (Cannot do a third attack afterwards)', multiPick: false },
        { name: 'Dual-Wielding Impact', passive: 'When dual wielding, once per combat, you may ignore the damage die size reduction penalty on your second attack for that instance of damage.', multiPick: false },
        { name: 'Rallying Cry', passive: 'Once per session, using your BA, you and all your allies regain [PCHA]×2 HP. (The PCHA modifier is yours)', multiPick: false },
        { name: 'War Cry', passive: 'Once per session, using your BA, all enemies have the next [NCHA] turns with -1 on all modifiers. (The NCHA modifier is yours)', multiPick: false },
        { name: 'Fighting Spirit', passive: 'Once per combat, using your BA, gain [Phy stat]×2 Temporary Hit Points and your next attack gains +1 to hit.', multiPick: false },
        { name: 'Tireless Spirit', passive: 'When initiative is rolled and you\'re under 50% STA, regain 15 STA.', multiPick: false },
        { name: 'Strength Before Death', passive: 'When reduced to 0 HP, you may immediately summon one of your titans with their cost reduced by 20 STA. (Once per session)', multiPick: false },
        { name: 'Projectile Deflection', passive: 'When hit by a ranged attack (if valid), use your reaction to reduce the damage by 1d10 + DEF×2. Used after a failed opposed roll.', multiPick: false },
        { name: 'Rejuvenation', passive: 'Once per combat, you may use your action to cleanse yourself from a status effect.', multiPick: false },
        { name: 'Adrenaline Rush', passive: 'Whenever you score a Critical Hit or reduce a creature to 0 HP, you regain 5 STA. (Counts if you attacked the creature the turn before it died)', multiPick: false },
        { name: 'Titan Synergy - Soul Link', passive: 'When your active Titan takes damage, you may use your Reaction to take half of that damage yourself (the Titan takes the other half). The damage you take ignores resistances.', multiPick: false },
        { name: 'Field Maintenance', passive: 'Once per mission, during a Short Rest, quick-repair a Cracked weapon — it becomes usable for 1 more mission before needing full Foundation repair. (Once per weapon, refreshes on full repair)', multiPick: false },
        { name: 'Coordinated Strike', passive: 'If you and your Titans attack the same target in the same turn, the second attack and all attacks after during your turn deal extra damage equal to your [SPL Mod].', multiPick: false },
        { name: 'Defensive Stance', passive: 'Use a Bonus Action to enter a defensive posture. Until the start of your next turn, gain +2 DEF AC and +1 to all Opposed Rolls, but you cannot use your reaction to cast Spells or active Abilities.', multiPick: false },
        { name: 'Emergency Med-Kit', passive: 'You can use a Bonus Action to stabilize a dying ally (instead of a full action). If you use an Action instead, they also regain 1 HP.', multiPick: false },
        { name: 'Scout\'s Information', passive: 'You can use your holotome to scan an unknown titan using only a bonus action or reaction (if you have the holotome).', multiPick: false },
    ],
    // Division Up Feats (awarded when crossing a letter boundary, e.g. D+ → C-)
    divisionUpFeats: [
        { name: 'Built like a Tank', passive: '+3 HP per division increase.', multiPick: false },
        { name: 'Improved Critical', passive: 'Your attacks now crit on 19 as well.', multiPick: false },
        { name: 'Rapid Strikes', passive: 'When making an attack roll with advantage, once per combat, you may instead give up the advantage and perform 2 separate attacks.', multiPick: false },
        { name: 'Action Surge', passive: 'Once per session, gain one extra Action for the turn.', multiPick: false },
        { name: 'Rapid Surge', passive: 'Once per combat, gain one extra Bonus Action for the turn.', multiPick: false },
        { name: 'Reflex Surge', passive: 'Once per combat, gain one extra Reaction for the round. (May be used at any point)', multiPick: false },
        { name: 'Inspiring Surge', passive: 'Once per combat, when an ally has a chance to use a reaction, you may activate this and have said ally perform their reactive move without spending the reaction. (Can also be used if they have no reaction)', multiPick: false },
        { name: 'Relentless Endurance', passive: 'When reduced to 0 HP but not killed outright, you can choose to drop to 1 HP instead. (Once per session)', multiPick: false },
        { name: 'Spell Echo', passive: 'Once per combat, if you use your Action to cast a Spell of Rank C or lower, you can cast the same spell again immediately as a Bonus Action without paying the STA cost. (No boosts improve the second cast)', multiPick: false },
        { name: 'Master of Many Forms', passive: 'Your limit of Titans carried increases by +1.', multiPick: false },
        { name: 'Titan Overdrive', passive: 'Once per session, command one Titan to push beyond its limits. For 1 turn, that Titan adds your SPL to its ATK and DEF. After the round, the Titan takes 10 damage (or 20%, whichever is larger) and stats revert. (Can be used anytime)', multiPick: false },
        { name: 'Arcane Recovery', passive: 'Once per session, during a Short Rest, the Seeker can meditate to recover an extra Spell Slot used.', multiPick: false },
        { name: 'Arcane Connection', passive: 'Cantrip Spells can be free every turn.', multiPick: false },
        { name: 'Combat Focus', passive: 'Can have the combat passive while using weapons.', multiPick: false },
        { name: 'Dice Control', passive: 'At the start of a session, roll a d20. At any moment, you can use that die to substitute any other d20 rolled.', multiPick: false },
    ],
};

// ─── In-memory lists state (loaded async from Supabase on init) ───────────────
let _listsState = null;

function getLists() {
    if (_listsState) return JSON.parse(JSON.stringify(_listsState));
    // Fallback to defaults if not loaded yet
    return JSON.parse(JSON.stringify(DEFAULT_LISTS));
}

function saveLists(lists) {
    _listsState = JSON.parse(JSON.stringify(lists));
    // Fire-and-forget save to Supabase
    sbSaveLists(lists).catch(e => console.error('saveLists error', e));
}

// Called once on page load — fetches lists from Supabase (or uses defaults)
async function initLists() {
    try {
        const remote = await sbLoadLists();
        if (remote && Object.keys(remote).length) {
            const base = JSON.parse(JSON.stringify(DEFAULT_LISTS));
            _listsState = { ...base, ...remote };
        } else {
            _listsState = JSON.parse(JSON.stringify(DEFAULT_LISTS));
        }
    } catch {
        _listsState = JSON.parse(JSON.stringify(DEFAULT_LISTS));
    }
}

// ─── Getters ──────────────────────────────────────────────────────────────────
function getOriginFeats()    { return getLists().originFeats;    }
function getCombatStyles()   { return getLists().combatStyles;   }
function getCombatMoves()    { return getLists().combatMoves;    }
function getMaterials()      { return getLists().materials;      }
function getEnchantments()   { return getLists().enchantments;   }
function getUsageTags()      { return getLists().usageTags;      }
function getWeaponTypeTags() { return getLists().weaponTypeTags; }
function getSpecialRecipes() { return getLists().specialRecipes; }
function getSpellClasses()      { return getLists().spellClasses;      }
function getSpellTags()         { return getLists().spellTags;         }
function getWeaponTechniques()  { return getLists().weaponTechniques || []; }
function getRankUpFeats()       { return getLists().rankUpFeats      || []; }
function getDivisionUpFeats()   { return getLists().divisionUpFeats  || []; }

// ─── Object list CRUD (originFeats, combatStyles, combatMoves, materials, enchantments) ─
function addObjectToList(listKey, obj) {
    const lists = getLists();
    lists[listKey] = lists[listKey] || [];
    lists[listKey].push(obj);
    saveLists(lists);
    return true;
}

function updateObjectInList(listKey, index, obj) {
    const lists = getLists();
    if (lists[listKey] && lists[listKey][index] !== undefined) {
        lists[listKey][index] = obj;
        saveLists(lists);
        return true;
    }
    return false;
}

function removeObjectFromList(listKey, index) {
    const lists = getLists();
    if (lists[listKey]) {
        lists[listKey].splice(index, 1);
        saveLists(lists);
    }
}

// ─── String list CRUD (usageTags, weaponTypeTags) ─────────────────────────────
function addStringToList(listKey, name) {
    name = name.trim();
    if (!name) return false;
    const lists = getLists();
    if (lists[listKey].map(s => s.toLowerCase()).includes(name.toLowerCase())) return false;
    lists[listKey].push(name);
    saveLists(lists);
    return true;
}

function removeStringFromList(listKey, name) {
    const lists = getLists();
    lists[listKey] = lists[listKey].filter(s => s !== name);
    saveLists(lists);
}

// ─── Populate a <select> with object-list items (by name) ────────────────────
function populateSelect(selectId, items, currentValue) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const prevPlaceholder = el.querySelector('option[value=""]');
    el.innerHTML = '';
    if (prevPlaceholder) el.appendChild(prevPlaceholder);
    items.forEach(item => {
        const name = typeof item === 'string' ? item : item.name;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === currentValue) opt.selected = true;
        el.appendChild(opt);
    });
    if (currentValue) el.value = currentValue;
}
