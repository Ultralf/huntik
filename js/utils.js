// ─── Rank definitions ────────────────────────────────────────────────────────
const RANKS = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+'];
const RANK_DIVISIONS = { D: 1, C: 2, B: 3, A: 4, S: 5 };

// Thresholds: rank requires stat total (STR+AGL+DEF+WLL+INT+CHA) >= min
// D step:2  C step:3  B step:4  A step:5  S step:6
const RANK_THRESHOLDS = [
    { rank: 'S+', min: 120 },
    { rank: 'S',  min: 114 },
    { rank: 'S-', min: 108 },
    { rank: 'A+', min: 102 },
    { rank: 'A',  min: 97  },
    { rank: 'A-', min: 92  },
    { rank: 'B+', min: 87  },
    { rank: 'B',  min: 83  },
    { rank: 'B-', min: 79  },
    { rank: 'C+', min: 75  },
    { rank: 'C',  min: 72  },
    { rank: 'C-', min: 69  },
    { rank: 'D+', min: 66  },
    { rank: 'D',  min: 64  },
    { rank: 'D-', min: 0   },
];

function getRankNumber(rank) {
    return RANKS.indexOf(rank) + 1; // 1–15
}

function getRankLetter(rank) {
    return rank.replace(/[-+]/g, '');
}

function getRankDivision(rank) {
    return RANK_DIVISIONS[getRankLetter(rank)] || 1;
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────
function getMod(value) {
    return Math.floor((value - 10) / 2);
}

function formatMod(mod) {
    return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatStatWithMod(value) {
    return `${value} (${formatMod(getMod(value))})`;
}

// ─── Rank from stat total ─────────────────────────────────────────────────────
function calcRankFromStats(stats) {
    const CHA = calcCHA(stats.PCHA, stats.NCHA);
    const total = stats.STR + stats.AGL + stats.DEF + stats.WLL + stats.INT + CHA;
    for (const t of RANK_THRESHOLDS) {
        if (total >= t.min) return { rank: t.rank, total };
    }
    return { rank: 'D-', total };
}

// ─── Improvement PP cost ──────────────────────────────────────────────────────
// Note: stat value 18 not specified in rules — treated as 200 PP (same as 19–21)
// isSocial: PCHA/NCHA cost half (CHA only rises every 2 stat raises)
function getImprovementCost(statValue, isSocial) {
    let base;
    if (statValue >= 22)     base = 225;
    else if (statValue >= 18) base = 200;
    else if (statValue >= 16) base = 150;
    else if (statValue >= 14) base = 125;
    else if (statValue >= 8)  base = 100;
    else return null; // below 8: not improvable via this system
    return isSocial ? Math.floor(base / 2) : base;
}

// ─── Derived stat calculations ────────────────────────────────────────────────
function calcCHA(pcha, ncha) {
    return Math.floor((pcha + ncha) / 2);
}

function calcHP(def, rank) {
    const base = def * 10 * 3 / 5; // def × 6
    const bonus = getRankDivision(rank) * 5;
    return base + bonus;
}

function calcSTA(str, agl, wll, int_, rank) {
    const rankNum = getRankNumber(rank);
    return Math.floor(
        (wll * 10 / 2) +
        (str * 10 / 4) +
        (agl * 10 / 4) +
        (int_ * 10 / 8) +
        (rankNum * 3)
    );
}

function calcEPSlots(cha) {
    return 2 + getMod(cha);
}

function calcACDEF(def) {
    return 10 + getMod(def);
}

function calcACAGL(agl) {
    return 10 + getMod(agl);
}

function calcSPL(int_, wll) {
    const val = Math.max(int_, wll);
    return { value: val, display: formatStatWithMod(val) };
}

// ─── Full derived stats from character object ─────────────────────────────────
function deriveStats(char) {
    const s = char.stats;
    const rankResult = calcRankFromStats(s);
    const rank = rankResult.rank;
    const CHA = calcCHA(s.PCHA, s.NCHA);
    return {
        CHA,
        rank,
        statTotal: rankResult.total,
        HP:    calcHP(s.DEF, rank),
        STA:   calcSTA(s.STR, s.AGL, s.WLL, s.INT, rank),
        EP:    calcEPSlots(CHA),
        ACDEF: calcACDEF(s.DEF),
        ACAGL: calcACAGL(s.AGL),
        SPL:   calcSPL(s.INT, s.WLL),
    };
}

// ─── Image resize utility ─────────────────────────────────────────────────────
function resizeImageFile(file, maxSize, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', quality || 0.8));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
