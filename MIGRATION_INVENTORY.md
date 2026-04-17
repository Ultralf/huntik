# Huntik localStorage → Supabase Migration Inventory

## 1. DISTINCT DATA ENTITIES & STRUCTURES

### 1.1 Account Entity
**Scope:** Global | **Storage:** localStorage + sessionStorage
```
username (string) - e.g. "admin", "player1"
password (string) - plaintext
role ("admin" | "player")
displayName (string)
loginAlias? (optional string - custom login name)
```

### 1.2 Session Entity
**Scope:** Per-user, transient | **Storage:** sessionStorage only
```
username (string)
role ("admin" | "player")
displayName (string)
```

### 1.3 Character Entity
**Scope:** Per-user | **Storage:** localStorage `huntik_character_<username>`
```
name, originFeat, alignment, image (base64), rank
stats: { STR, AGL, DEF, WLL, INT, PCHA, NCHA }
improvement: { combatMastering, mentalMastering, socialInteraction }
training: { PPM, PPArm, PPA, PPR }
knownCombatStyles: [{ name, passive }]
knownWeaponStyles: ["Light", "Heavy", "Ranged"]
knownCombatMoves: [{ name, rank, effect, stats, cost }]
knownWeaponTechniques: [{ name, rank, categories, effect, stats }]
spells: [{ id, name, rank, class, effect, stats, tags, holotome }]
weapons: [{ id, type, name, material, enchantment, usageTags, weaponTypeTag, weaponTypeTag2, effect, durabilityLeft, state, repairMissionsLeft, restoreMissionsLeft, image }]
shards: { materialName: count }
keyItems: [{ name, quantity }]
items: [{ name, desc, effect, quantity }]
artifacts: [{ name, desc, condition, passive, active, image }]
rankUpFeats: [{ name, passive, variation? }]
divisionUpFeats: [{ name, passive, variation? }]
epCurrent?: number (runtime)
```

### 1.4 Titans Entity
**Scope:** Per-user collection | **Storage:** localStorage `huntik_titans_<username>`
```
[{
  id, name, type, rank
  size ("small" | "average" | "large" | "colossal")
  linkDifficulty, baseHP
  ATK, DEF, AGL, SPL (modifiers)
  abilities: [{ name, effect, statsText }]
  traits (text)
  image, amuletImage, iconImage (base64)
  bp (Bound Points)
}]
```

### 1.5 Admin Lists Entity
**Scope:** Global | **Storage:** localStorage `huntik_lists`
```
originFeats, combatStyles, combatMoves, materials, enchantments
weaponTechniques, usageTags, weaponTypeTags, spellClasses, spellTags
specialRecipes, rankUpFeats, divisionUpFeats
```

---

## 2. LOCALSTORAGE KEYS

| Key | Scope | Type | Size |
|-----|-------|------|------|
| huntik_character_<username> | Per-user | JSON | LARGE |
| huntik_titans_<username> | Per-user | JSON | LARGE |
| huntik_accounts | Global | JSON | SMALL |
| huntik_lists | Global | JSON | MEDIUM |

---

## 3. READ/WRITE FUNCTIONS BY FILE

### character.js
**Core I/O:**
- loadCharacter() → huntik_character_<username>
- saveCharacter(char) → huntik_character_<username>

**Write-through (60+ functions, all call saveCharacter):**
submitCharForm, applyEditEP, confirmAddShard, confirmAddKeyItem, adjustShard, removeShard, adjustKeyItem, removeKeyItem, submitSpellForm, deleteSpell, addCombatStyleFree, addCombatStyle, removeCombatStyle, removeWeaponStyle, addWeaponStyleFree, addCombatMoveFree, addCombatMove, removeCombatMove, learnWeaponTechFree, removeWeaponTech, equipFeat, removeFeat, confirmAddItem, useItem, removeItem, confirmAddArtifact, removeArtifact, spendPP, applyAddImprPP, applyAddTrainPP, confirmSpendPPR

### titans.js
**Core I/O:**
- loadTitans() → huntik_titans_<username>
- saveTitans(titans) → huntik_titans_<username>

**Write-through:** usedInMission, applyBPChange, submitTitanForm, confirmDeleteTitan

### weapons.js
**Core I/O:** getWeapons, getShards, getKeyItems (read character), saveWeapons, saveShards (write character)

**Write-through:** useMission, repairWeapon, missionDoneRepairing, restoreSpecial, missionDoneRestoring, scrapWeapon, submitWeaponForm, craftRegular, craftSpecial

### lists.js
**Core I/O:**
- getLists() → huntik_lists + DEFAULT_LISTS merge
- saveLists(lists) → huntik_lists

**Write-through:** addObjectToList, updateObjectInList, removeObjectFromList, addStringToList, removeStringFromList

**Getters:** getOriginFeats, getCombatStyles, getCombatMoves, getMaterials, getEnchantments, getUsageTags, getWeaponTypeTags, getSpecialRecipes, getSpellClasses, getSpellTags, getWeaponTechniques, getRankUpFeats, getDivisionUpFeats

### auth.js
**Read:** getAccounts (huntik_accounts), getSession (huntik_session - sessionStorage), findAccountByLogin, getPlayerUsernames, getDisplayLogin

**Write:** setSession (huntik_session - sessionStorage), clearSession, updateAccountOverride (huntik_accounts)

**Auth:** changeLoginName, changePassword (call updateAccountOverride)

**Login:** getSession() on load → on submit: findAccountByLogin → verify → setSession

---

## 4. PER-USER vs GLOBAL

### Per-User
1. Character (huntik_character_<username>)
2. Titans (huntik_titans_<username>)
3. Session (huntik_session, sessionStorage only)

### Global
1. Accounts (huntik_accounts)
2. Admin Lists (huntik_lists)

---

## 5. SUPABASE TABLES

1. **accounts** - username, password (hashed), role, display_name, login_alias (unique)
2. **characters** - user_id (FK), name, stats (JSONB), improvement (JSONB), training (JSONB), [nested arrays as JSONB]
3. **titans** - user_id (FK), name, type, rank, abilities (JSONB), bp, [images]
4. **admin_lists** - list_key, list_data (JSONB)

**Nested in JSONB:** spells, weapons, styles, feats, inventory, combat moves, techniques

---

## 6. KEY FACTS

- 4 localStorage keys manage entire app state
- All images are base64 (large impact)
- ~20 nested arrays per character
- Single global lists blob
- Session is transient (sessionStorage only)
- Character is most complex (migrations priority)
- JSONB approach viable (no complex relationship queries)
- Per-user keyed by username → use user_id FK
- Full schema redesign possible

---

## 7. MIGRATION PHASES

**Phase 1:** Accounts + Auth + RLS + Admin Lists
**Phase 2:** Characters + Titans
**Phase 3:** Image optimization + Normalization if needed

