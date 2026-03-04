// Aqua Match - SJWD Water District
// Dr. Mario-style water treatment puzzle game

const FONT = "'Press Start 2P', 'Courier New', monospace";
const GAME_ID = 'aqua-match';

// --- Board dimensions ---
const COLS = 8;
const ROWS = 16;
const CELL = 28;

const BOARD_X = 16;
const BOARD_Y = 62;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

const PANEL_X = BOARD_X + BOARD_W + 14;
const CANVAS_W = 480;
const CANVAS_H = 580;

// --- Contaminant types ---
const BACTERIA = 'B';  // red
const ALGAE    = 'A';  // green
const RUST     = 'R';  // orange/yellow

const COLORS = {
    [BACTERIA]: { fill: 0xee3333, dark: 0x991111, light: 0xff9999, label: 'Bacteria' },
    [ALGAE]:    { fill: 0x22bb22, dark: 0x116611, light: 0x88ee88, label: 'Algae' },
    [RUST]:     { fill: 0xff9900, dark: 0xaa5500, light: 0xffcc66, label: 'Sediment' },
};
const COLOR_KEYS = [BACTERIA, ALGAE, RUST];

const MATCH_LEN = 4;

// ms per automatic row drop, indexed by level (1-20)
const BASE_SPEED = [0, 1000, 900, 800, 700, 600, 500, 420, 350, 290, 240,
                       200, 180, 160, 140, 120, 100, 90,  80,  70,  60];

// Contaminants to place per level
const VIRUS_COUNT = [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22,
                        24, 26, 28, 30, 32, 32, 32, 32, 32, 32];

// --- Phaser ---
const config = {
    type: Phaser.AUTO,
    width: CANVAS_W,
    height: CANVAS_H,
    parent: 'game-container',
    backgroundColor: '#0a1628',
    scene: { preload, create, update }
};
const game = new Phaser.Game(config);

// --- Game state ---
let board = [];
let capsule = null;   // { col, row, orientation, colors, cells }
let nextColors = null;

let score = 0, level = 1, virusCount = 0;
let gameOver = false, levelClear = false, gameStarted = false, paused = false;

let dropTimer = 0, dropInterval = 0;
let resolving = false, resolvePhase = 0, resolveTimer = 0;
let matchedCells = null, chainCount = 0;

const DAS_DELAY = 170, DAS_RATE = 55;
let dasLeft = 0, dasRight = 0;

// Phaser objects
let gfx, overlayGfx;
let scoreText, levelText, virusText;
let startGroup;
let lbGroup = null;

// --- Audio ---
let audioCtx = null;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function tone(freq, type, dur, vol = 0.08, delay = 0) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
}
function sfxMove()   { tone(440, 'sine', 0.04, 0.06); }
function sfxRotate() { tone(600, 'square', 0.07, 0.05); tone(900, 'square', 0.05, 0.04, 0.04); }
function sfxLock()   { tone(300, 'triangle', 0.12, 0.10); }
function sfxClear(chain) {
    [523, 659, 784, 1047].forEach((f, i) => {
        if (i > chain + 1) return;
        tone(f, 'sine', 0.25, 0.12, i * 0.07);
    });
}
function sfxLevelClear() {
    [523, 659, 784, 1047, 784, 1047, 1175, 1568].forEach((f, i) =>
        tone(f, 'triangle', 0.18, 0.10, i * 0.1));
}
function sfxGameOver() {
    [440, 370, 330, 277, 220].forEach((f, i) =>
        tone(f, 'sawtooth', 0.20, 0.08, i * 0.13));
}

// --- Leaderboard ---
function lbKey() { return 'sjwd_' + GAME_ID + '_' + new Date().toISOString().slice(0, 10); }
function getLB() { try { return JSON.parse(localStorage.getItem(lbKey()) || '[]'); } catch(e) { return []; } }
function saveLBData(e) { localStorage.setItem(lbKey(), JSON.stringify(e)); }
function isTopScore(s) { const lb = getLB(); return s > 0 && (lb.length < 5 || s > lb[lb.length - 1].score); }
function addLBEntry(name, s) {
    const lb = getLB(), ts = Date.now();
    lb.push({ name: name.slice(0, 12).toUpperCase(), score: s, ts });
    lb.sort((a, b) => b.score - a.score || a.ts - b.ts);
    const top5 = lb.slice(0, 5);
    saveLBData(top5);
    return { entries: top5, rank: top5.findIndex(e => e.ts === ts) };
}
function showNameEntry(playerScore, onSubmit) {
    const ol = document.createElement('div');
    ol.id = 'sjwd-name-overlay';
    Object.assign(ol.style, {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        fontFamily: FONT, color: '#fff'
    });
    ol.innerHTML = `
        <div style="font-size:13px;color:#ff4444;margin-bottom:18px;text-shadow:0 0 10px #ff0000">NEW HIGH SCORE!</div>
        <div style="font-size:10px;color:#ffff00;margin-bottom:6px">SCORE: ${playerScore}</div>
        <div style="font-size:9px;color:#aaa;margin-bottom:14px">Enter your name:</div>
        <input id="sjwd-name-input" maxlength="12" autocomplete="off"
            style="font-family:${FONT};font-size:14px;background:#0d1b2a;color:#00bfff;
                   border:2px solid #00bfff;border-radius:4px;padding:8px 14px;
                   text-align:center;width:200px;outline:none;text-transform:uppercase;margin-bottom:18px">
        <button id="sjwd-name-submit"
            style="font-family:${FONT};font-size:10px;background:#4a5568;color:#00bfff;
                   border:2px solid #00bfff;border-radius:4px;padding:8px 20px;cursor:pointer">SUBMIT</button>`;
    document.body.appendChild(ol);
    const inp = document.getElementById('sjwd-name-input');
    const btn = document.getElementById('sjwd-name-submit');
    inp.focus();
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); });
    const submit = () => {
        const name = inp.value.trim() || 'AAA';
        document.body.removeChild(ol);
        onSubmit(name);
    };
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}
function showGameOverScreen(scene, subtitleLines) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    lbGroup = scene.add.group();
    const CW = CANVAS_W, CH = CANVAS_H;
    lbGroup.add(scene.add.rectangle(CW/2, CH/2, CW, CH, 0x000000, 0.88).setDepth(50));
    lbGroup.add(scene.add.text(CW/2, 72, 'GAME OVER', {
        fontFamily: FONT, fontSize: '22px', fill: '#ff4444',
        shadow: { blur: 10, color: '#ff0000', fill: true }
    }).setOrigin(0.5).setDepth(51));
    let ty = 116;
    subtitleLines.forEach(line => {
        lbGroup.add(scene.add.text(CW/2, ty, line, {
            fontFamily: FONT, fontSize: '10px', fill: '#ffff00'
        }).setOrigin(0.5).setDepth(51));
        ty += 24;
    });
    const lbY = ty + 10;
    lbGroup.add(scene.add.rectangle(CW/2, lbY, 380, 2, 0x2a4a6a).setDepth(51));
    lbGroup.add(scene.add.text(CW/2, lbY + 12, "TODAY'S TOP 5", {
        fontFamily: FONT, fontSize: '9px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51));
    const entries = scene._lbEntries || [];
    const myRank = scene._lbRank !== undefined ? scene._lbRank : -1;
    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#aaaaaa', '#888888'];
    entries.forEach((e, i) => {
        const ry = lbY + 38 + i * 28;
        const isMe = i === myRank;
        const col = isMe ? '#ffffff' : (rankColors[i] || '#888');
        if (isMe) lbGroup.add(scene.add.rectangle(CW/2, ry + 2, 360, 20, 0x1a3a5c).setDepth(51));
        lbGroup.add(scene.add.text(100, ry, '#' + (i+1), { fontFamily: FONT, fontSize: '8px', fill: rankColors[i] || '#888' }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(210, ry, e.name || '---', { fontFamily: FONT, fontSize: '8px', fill: col }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(370, ry, String(e.score), { fontFamily: FONT, fontSize: '8px', fill: col }).setOrigin(0.5).setDepth(51));
    });
    if (!entries.length) {
        lbGroup.add(scene.add.text(CW/2, lbY + 50, 'No scores today yet', {
            fontFamily: FONT, fontSize: '8px', fill: '#4a5568'
        }).setOrigin(0.5).setDepth(51));
    }
    const btnY = lbY + 38 + 5 * 28 + 20;
    const rBg = scene.add.rectangle(148, btnY, 196, 38, 0x4a5568).setStrokeStyle(2, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    lbGroup.add(rBg);
    const rTxt = scene.add.text(148, btnY, 'PLAY AGAIN', { fontFamily: FONT, fontSize: '9px', fill: '#00bfff' }).setOrigin(0.5).setDepth(52);
    lbGroup.add(rTxt);
    rBg.on('pointerover', () => { rBg.setFillStyle(0x718096); rTxt.setFill('#ffffff'); });
    rBg.on('pointerout',  () => { rBg.setFillStyle(0x4a5568); rTxt.setFill('#00bfff'); });
    rBg.on('pointerdown', () => restartGame());
    const hBg = scene.add.rectangle(332, btnY, 196, 38, 0x4a5568).setStrokeStyle(2, 0x4a90d9).setDepth(51).setInteractive({ useHandCursor: true });
    lbGroup.add(hBg);
    const hTxt = scene.add.text(332, btnY, 'ARCADE HUB', { fontFamily: FONT, fontSize: '9px', fill: '#4a90d9' }).setOrigin(0.5).setDepth(52);
    lbGroup.add(hTxt);
    hBg.on('pointerover', () => { hBg.setFillStyle(0x718096); hTxt.setFill('#ffffff'); });
    hBg.on('pointerout',  () => { hBg.setFillStyle(0x4a5568); hTxt.setFill('#4a90d9'); });
    hBg.on('pointerdown', () => { window.location.href = '../'; });
}

// --- Board helpers ---
function emptyBoard() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}
function isOccupied(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
    return board[row][col] !== null;
}
function placeContaminants(count) {
    let placed = 0, tries = 0;
    while (placed < count && tries < 3000) {
        tries++;
        const c = Math.floor(Math.random() * COLS);
        const r = 4 + Math.floor(Math.random() * (ROWS - 4));
        if (board[r][c]) continue;
        board[r][c] = { color: COLOR_KEYS[Math.floor(Math.random() * 3)], type: 'virus' };
        placed++;
    }
    virusCount = placed;
}
function randomColor() { return COLOR_KEYS[Math.floor(Math.random() * 3)]; }

// --- Capsule ---
function buildCells(col, row, ori, colors) {
    return ori === 'H'
        ? [{ x: col, y: row, color: colors[0] }, { x: col + 1, y: row, color: colors[1] }]
        : [{ x: col, y: row, color: colors[0] }, { x: col, y: row + 1, color: colors[1] }];
}
function spawnCapsule() {
    const colors = nextColors || [randomColor(), randomColor()];
    nextColors = [randomColor(), randomColor()];
    const col = Math.floor(COLS / 2) - 1;
    capsule = { col, row: 0, orientation: 'H', colors, cells: buildCells(col, 0, 'H', colors) };
    if (capsule.cells.some(c => isOccupied(c.x, c.y))) {
        gameOver = true;
        sfxGameOver();
        showOverlay('gameover');
        capsule = null;
    }
}
function refreshCells() {
    capsule.cells = buildCells(capsule.col, capsule.row, capsule.orientation, capsule.colors);
}
function tryMove(dc, dr) {
    if (capsule.cells.some(c => isOccupied(c.x + dc, c.y + dr))) return false;
    capsule.col += dc; capsule.row += dr;
    refreshCells();
    return true;
}
function tryRotate(dir) {
    // dir: 1=CW, -1=CCW
    const { col, row, orientation, colors } = capsule;
    const newOri = orientation === 'H' ? 'V' : 'H';
    const newColors = orientation === 'H'
        ? (dir === 1 ? [colors[0], colors[1]] : [colors[1], colors[0]])
        : (dir === 1 ? [colors[1], colors[0]] : [colors[0], colors[1]]);
    const kicks = [[0,0], [-1,0], [1,0], [0,-1]];
    for (const [dc, dr] of kicks) {
        const cells = buildCells(col + dc, row + dr, newOri, newColors);
        if (!cells.some(c => isOccupied(c.x, c.y))) {
            capsule.col += dc; capsule.row += dr;
            capsule.orientation = newOri; capsule.colors = newColors;
            refreshCells();
            return true;
        }
    }
    return false;
}
function lockCapsule() {
    sfxLock();
    capsule.cells.forEach(c => { board[c.y][c.x] = { color: c.color, type: 'capsule' }; });
    capsule = null;
    startResolve();
}

// --- Match resolution ---
function findMatches() {
    const matched = new Set();
    // horizontal
    for (let r = 0; r < ROWS; r++) {
        let run = 1;
        for (let c = 1; c <= COLS; c++) {
            const prev = board[r][c - 1], curr = c < COLS ? board[r][c] : null;
            if (curr && prev && curr.color === prev.color) { run++; }
            else {
                if (run >= MATCH_LEN) for (let k = c - run; k < c; k++) matched.add(`${r},${k}`);
                run = 1;
            }
        }
    }
    // vertical
    for (let c = 0; c < COLS; c++) {
        let run = 1;
        for (let r = 1; r <= ROWS; r++) {
            const prev = board[r - 1][c], curr = r < ROWS ? board[r][c] : null;
            if (curr && prev && curr.color === prev.color) { run++; }
            else {
                if (run >= MATCH_LEN) for (let k = r - run; k < r; k++) matched.add(`${k},${c}`);
                run = 1;
            }
        }
    }
    return matched;
}

function startResolve() {
    const matched = findMatches();
    if (matched.size === 0) {
        resolving = false; chainCount = 0;
        if (!levelClear && !gameOver) spawnCapsule();
        return;
    }
    resolving = true; resolvePhase = 1; resolveTimer = 0;
    matchedCells = matched;
    sfxClear(chainCount);

    let virusesCleared = 0;
    matched.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        if (board[r][c]?.type === 'virus') virusesCleared++;
    });
    score += matched.size * 100 * (chainCount + 1) + virusesCleared * 800 * (chainCount + 1);
    virusCount -= virusesCleared;
    updateHUD();
}

function stepResolve(delta) {
    if (!resolving) return;
    resolveTimer += delta;
    if (resolvePhase === 1 && resolveTimer >= 320) {
        // Clear matched
        matchedCells.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            board[r][c] = null;
        });
        if (virusCount <= 0) {
            virusCount = 0; levelClear = true; resolving = false;
            sfxLevelClear();
            showOverlay('levelclear');
            setTimeout(advanceLevel, 2000);
            return;
        }
        applyGravity();
        resolvePhase = 2; resolveTimer = 0;
    } else if (resolvePhase === 2 && resolveTimer >= 200) {
        resolving = false; resolvePhase = 0;
        chainCount++;
        startResolve();
    }
}

function applyGravity() {
    for (let c = 0; c < COLS; c++) {
        let w = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r][c]) { board[w][c] = board[r][c]; if (w !== r) board[r][c] = null; w--; }
        }
    }
}

function advanceLevel() {
    hideOverlay('levelclear');
    level = Math.min(level + 1, 20);
    levelClear = false; gameOver = false;
    dropInterval = BASE_SPEED[level] || 60;
    dropTimer = 0; chainCount = 0;
    emptyBoard();
    placeContaminants(VIRUS_COUNT[level] || 32);
    nextColors = [randomColor(), randomColor()];
    spawnCapsule();
    updateHUD();
}

// --- Phaser scene ---
function preload() {}

function create() {
    gfx = this.add.graphics();
    overlayGfx = this.add.graphics();

    // Title
    this.add.text(CANVAS_W / 2, 14, 'AQUA MATCH', {
        font: '14px "Press Start 2P"', fill: '#00bfff',
        shadow: { blur: 8, color: '#00bfff', fill: true }
    }).setOrigin(0.5);
    this.add.text(CANVAS_W / 2, 37, 'Water Treatment Puzzle', {
        font: '7px "Press Start 2P"', fill: '#4a90d9'
    }).setOrigin(0.5);

    // HUD labels + values
    const lbl = (x, y, t) => this.add.text(x, y, t, { font: '8px "Press Start 2P"', fill: '#aaccff' });
    const val = (x, y, t) => this.add.text(x, y, t, { font: '10px "Press Start 2P"', fill: '#ffffff' });
    lbl(PANEL_X, BOARD_Y + 8,  'SCORE');   scoreText = val(PANEL_X, BOARD_Y + 24, '0');
    lbl(PANEL_X, BOARD_Y + 62, 'LEVEL');   levelText = val(PANEL_X, BOARD_Y + 78, '1');
    lbl(PANEL_X, BOARD_Y + 116,'BUGS');    virusText = val(PANEL_X, BOARD_Y + 132,'0');
    lbl(PANEL_X, BOARD_Y + 204,'NEXT');

    // Legend labels
    COLOR_KEYS.forEach((k, i) => {
        this.add.text(PANEL_X + 26, BOARD_Y + 316 + i * 36, COLORS[k].label, {
            font: '7px "Press Start 2P"', fill: '#aaccff'
        });
    });

    // Back button
    this.add.text(8, CANVAS_H - 18, '← BACK', {
        font: '7px "Press Start 2P"', fill: '#4a5568'
    }).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { window.location.href = '../'; })
      .on('pointerover', function() { this.setStyle({ fill: '#00bfff' }); })
      .on('pointerout',  function() { this.setStyle({ fill: '#4a5568' }); });

    // Start screen
    buildStartScreen(this);

    // Mobile controls
    hookMobileControls();

    // Keyboard
    const kb = this.input.keyboard;
    kb.on('keydown', (e) => {
        initAudio();
        if (!gameStarted) { if (e.code === 'Enter' || e.code === 'Space') startGame(); return; }
        if (gameOver)     { if (e.code === 'Enter' || e.code === 'Space') restartGame(); return; }
        if (e.code === 'KeyP') { paused = !paused; return; }
        if (paused || resolving || !capsule) return;
        if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { if (tryMove(-1, 0)) sfxMove(); dasLeft = -DAS_DELAY; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { if (tryMove( 1, 0)) sfxMove(); dasRight = -DAS_DELAY; }
        if (e.code === 'ArrowUp'   || e.code === 'KeyZ')  { if (tryRotate(1))  sfxRotate(); }
        if (e.code === 'KeyX')                            { if (tryRotate(-1)) sfxRotate(); }
        if (e.code === 'ArrowDown'  || e.code === 'KeyS') softDrop();
    });
    kb.on('keyup', (e) => {
        if (e.code === 'ArrowLeft'  || e.code === 'KeyA') dasLeft = 0;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') dasRight = 0;
    });

    this.input.once('pointerdown', () => { initAudio(); });
}

function softDrop() {
    if (!capsule || resolving) return;
    if (!tryMove(0, 1)) lockCapsule();
}

function hookMobileControls() {
    function tap(id, fn) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); fn(); }, { passive: false });
        el.addEventListener('mousedown',  e => { e.preventDefault(); initAudio(); fn(); });
    }
    tap('btn-left',     () => { if (!gameStarted) startGame(); else if (capsule && !resolving) { if (tryMove(-1,0)) sfxMove(); } });
    tap('btn-right',    () => { if (!gameStarted) startGame(); else if (capsule && !resolving) { if (tryMove(1,0))  sfxMove(); } });
    tap('btn-rotate-l', () => { if (!gameStarted) { startGame(); return; } if (gameOver) { restartGame(); return; } if (capsule && !resolving) { tryRotate(-1); sfxRotate(); } });
    tap('btn-rotate-r', () => { if (!gameStarted) { startGame(); return; } if (gameOver) { restartGame(); return; } if (capsule && !resolving) { tryRotate(1);  sfxRotate(); } });

    const downEl = document.getElementById('btn-down');
    if (!downEl) return;
    let iv = null;
    const startDrop = () => { softDrop(); iv = setInterval(softDrop, 80); };
    const stopDrop  = () => clearInterval(iv);
    downEl.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); if (!gameStarted) startGame(); else if (gameOver) restartGame(); else startDrop(); }, { passive: false });
    downEl.addEventListener('touchend',   stopDrop);
    downEl.addEventListener('mousedown',  e => { e.preventDefault(); initAudio(); if (!gameStarted) startGame(); else if (gameOver) restartGame(); else startDrop(); });
    downEl.addEventListener('mouseup',    stopDrop);
}

function update(time, delta) {
    gfx.clear();
    overlayGfx.clear();

    if (!gameStarted) { animateStartBg(); return; }

    drawBoard();
    drawSidePanel();

    if (gameOver || levelClear) return;
    if (paused) { drawPauseOverlay(); return; }

    if (resolving) { stepResolve(delta); drawFlash(); return; }

    if (!capsule) return;

    // DAS
    if (dasLeft !== 0) { dasLeft += delta; if (dasLeft >= 0) { if (tryMove(-1,0)) sfxMove(); dasLeft -= DAS_RATE; } }
    if (dasRight !== 0) { dasRight += delta; if (dasRight >= 0) { if (tryMove(1,0))  sfxMove(); dasRight -= DAS_RATE; } }

    // Auto-drop
    dropTimer += delta;
    if (dropTimer >= dropInterval) {
        dropTimer = 0;
        if (!tryMove(0, 1)) lockCapsule();
    }

    drawGhost();
    drawCapsule();
}

// --- Drawing ---
function animateStartBg() {
    const t = Date.now() / 1000;
    gfx.fillStyle(0x061428, 1);
    gfx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let i = 0; i < 14; i++) {
        const bx = ((i * 87 + t * 28) % (CANVAS_W - 40)) + 20;
        const by = CANVAS_H - ((i * 73 + t * 45 * (0.4 + (i % 3) * 0.3)) % CANVAS_H);
        const br = 3 + (i % 5) * 3;
        gfx.fillStyle(0x00bfff, 0.1 + 0.1 * (i % 3));
        gfx.fillCircle(bx, by, br);
    }
}

function drawBoard() {
    gfx.fillStyle(0x061428, 1);
    gfx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    gfx.lineStyle(1, 0x1a3a5c, 0.4);
    for (let r = 0; r <= ROWS; r++) gfx.lineBetween(BOARD_X, BOARD_Y + r*CELL, BOARD_X + BOARD_W, BOARD_Y + r*CELL);
    for (let c = 0; c <= COLS; c++) gfx.lineBetween(BOARD_X + c*CELL, BOARD_Y, BOARD_X + c*CELL, BOARD_Y + BOARD_H);
    gfx.lineStyle(3, 0x2a6a9a, 1);
    gfx.strokeRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = board[r][c];
            if (!cell) continue;
            const px = BOARD_X + c * CELL, py = BOARD_Y + r * CELL;
            if (cell.type === 'virus') drawContaminant(gfx, px, py, cell.color);
            else drawCapsuleHalf(gfx, px, py, cell.color);
        }
    }
}

function drawCapsule() {
    if (!capsule) return;
    capsule.cells.forEach((c, i) => {
        const side = capsule.orientation === 'H'
            ? (i === 0 ? 'left' : 'right')
            : (i === 0 ? 'top' : 'bottom');
        drawCapsuleHalf(gfx, BOARD_X + c.x * CELL, BOARD_Y + c.y * CELL, c.color, side);
    });
}

function drawGhost() {
    if (!capsule) return;
    let drop = 0;
    while (capsule.cells.every(c => !isOccupied(c.x, c.y + drop + 1))) drop++;
    if (drop === 0) return;
    capsule.cells.forEach(c => {
        const col = COLORS[c.color];
        gfx.lineStyle(2, col.fill, 0.28);
        gfx.strokeRect(BOARD_X + c.x*CELL + 2, BOARD_Y + (c.y+drop)*CELL + 2, CELL-4, CELL-4);
    });
}

function drawCapsuleHalf(g, px, py, color, side = 'single') {
    const col = COLORS[color];
    const pad = 2, r = 6;
    const x = px + pad, y = py + pad, w = CELL - pad*2, h = CELL - pad*2;

    // Shadow
    g.fillStyle(col.dark, 1);
    g.fillRoundedRect(x, y, w, h, r);

    // Body
    g.fillStyle(col.fill, 1);
    g.fillRoundedRect(x+1, y+1, w-2, h-2, r);

    // Shine
    g.fillStyle(col.light, 0.5);
    g.fillRoundedRect(x+4, y+3, w-14, Math.floor(h*0.34), r/2);

    // Connection notch indicator (subtle darker strip on flat edge)
    g.fillStyle(col.dark, 0.35);
    if (side === 'left')   g.fillRect(px + CELL - 5, py + 5, 3, CELL - 10);
    if (side === 'right')  g.fillRect(px + 2,         py + 5, 3, CELL - 10);
    if (side === 'top')    g.fillRect(px + 5, py + CELL - 5, CELL - 10, 3);
    if (side === 'bottom') g.fillRect(px + 5, py + 2,         CELL - 10, 3);
}

function drawContaminant(g, px, py, color) {
    const col = COLORS[color];
    const cx = px + CELL / 2, cy = py + CELL / 2, r = CELL / 2 - 4;

    // Glow
    g.fillStyle(col.fill, 0.25);
    g.fillCircle(cx, cy, r + 4);

    // Body
    g.fillStyle(col.fill, 1);
    g.fillCircle(cx, cy, r);

    // Highlight
    g.fillStyle(col.light, 0.6);
    g.fillCircle(cx - r*0.25, cy - r*0.28, r*0.32);

    // Spikes
    g.lineStyle(2, col.dark, 1);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.lineBetween(
            cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1),
            cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5)
        );
    }

    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - 3, cy - 1, 2);
    g.fillCircle(cx + 3, cy - 1, 2);

    // Frown
    g.lineStyle(1.5, 0x000000, 1);
    g.beginPath();
    g.arc(cx, cy + 3, 4, 0.4, Math.PI - 0.4, false);
    g.strokePath();
}

function drawSidePanel() {
    const px = PANEL_X - 4, pw = CANVAS_W - px - 2;
    gfx.fillStyle(0x0a1628, 0.9);
    gfx.fillRect(px, BOARD_Y, pw, BOARD_H);
    gfx.lineStyle(2, 0x2a4a6a, 1);
    gfx.strokeRect(px, BOARD_Y, pw, BOARD_H);

    // Next capsule preview
    if (nextColors) {
        const nx = PANEL_X + 4, ny = BOARD_Y + 224;
        drawCapsuleHalf(gfx, nx,        ny, nextColors[0], 'left');
        drawCapsuleHalf(gfx, nx + CELL, ny, nextColors[1], 'right');
    }

    // Legend circles
    COLOR_KEYS.forEach((k, i) => {
        const col = COLORS[k];
        const lx = PANEL_X + 10, ly = BOARD_Y + 318 + i * 36;
        gfx.fillStyle(col.fill, 1);
        gfx.fillCircle(lx, ly + 8, 8);
        gfx.fillStyle(col.light, 0.55);
        gfx.fillCircle(lx - 2, ly + 5, 3);
    });
}

function drawFlash() {
    if (!matchedCells) return;
    const alpha = Math.abs(Math.sin((Date.now() % 400) / 400 * Math.PI));
    matchedCells.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        overlayGfx.fillStyle(0xffffff, alpha * 0.75);
        overlayGfx.fillRect(BOARD_X + c*CELL+1, BOARD_Y + r*CELL+1, CELL-2, CELL-2);
    });
}

function drawPauseOverlay() {
    overlayGfx.fillStyle(0x000000, 0.55);
    overlayGfx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
}

// --- HUD ---
function updateHUD() {
    scoreText.setText(String(score));
    levelText.setText(String(level));
    virusText.setText(String(Math.max(0, virusCount)));
}

// --- Overlays ---
const overlayRefs = {};

function showOverlay(type) {
    const scene = game.scene.scenes[0];
    if (!scene) return;

    const grp = scene.add.group();
    overlayRefs[type] = grp;

    const bg = scene.add.rectangle(CANVAS_W/2, CANVAS_H/2, CANVAS_W - 40, 200, 0x0a1628, 0.95);
    if (type === 'gameover') bg.setStrokeStyle(3, 0xff4444);
    else bg.setStrokeStyle(3, 0x44cc44);
    grp.add(bg);

    if (type === 'gameover') {
        const subtitleLines = ['SCORE: ' + score, 'LEVEL: ' + level];
        if (isTopScore(score)) {
            showNameEntry(score, (name) => {
                const result = addLBEntry(name, score);
                scene._lbEntries = result.entries;
                scene._lbRank = result.rank;
                showGameOverScreen(scene, subtitleLines);
            });
        } else {
            scene._lbEntries = getLB();
            scene._lbRank = -1;
            showGameOverScreen(scene, subtitleLines);
        }
        // Clean up the simple overlay group since we're using the leaderboard screen
        grp.destroy(true);
        delete overlayRefs[type];
        return;
    } else {
        grp.add(scene.add.text(CANVAS_W/2, CANVAS_H/2 - 64, 'WATER CLEAN!', {
            font: '20px "Press Start 2P"', fill: '#44cc44',
            shadow: { blur: 10, color: '#00ff00', fill: true }
        }).setOrigin(0.5));
        grp.add(scene.add.text(CANVAS_W/2, CANVAS_H/2 - 24, `LEVEL ${level} COMPLETE`, {
            font: '11px "Press Start 2P"', fill: '#7fff7f'
        }).setOrigin(0.5));
        grp.add(scene.add.text(CANVAS_W/2, CANVAS_H/2 + 16, `SCORE: ${score}`, {
            font: '11px "Press Start 2P"', fill: '#ffffff'
        }).setOrigin(0.5));
        const next = scene.add.text(CANVAS_W/2, CANVAS_H/2 + 54, 'Next level incoming...', {
            font: '8px "Press Start 2P"', fill: '#aaccff'
        }).setOrigin(0.5);
        grp.add(next);
        scene.tweens.add({ targets: next, alpha: 0.1, duration: 400, yoyo: true, repeat: -1 });
    }
}

function hideOverlay(type) {
    if (overlayRefs[type]) { overlayRefs[type].destroy(true); delete overlayRefs[type]; }
}

// --- Start screen ---
function buildStartScreen(scene) {
    startGroup = scene.add.group();

    const bg = scene.add.rectangle(CANVAS_W/2, CANVAS_H/2, CANVAS_W, CANVAS_H, 0x061428, 0.96);
    startGroup.add(bg);

    startGroup.add(scene.add.text(CANVAS_W/2, 72, 'AQUA', {
        font: '40px "Press Start 2P"', fill: '#00bfff',
        stroke: '#004488', strokeThickness: 4,
        shadow: { blur: 14, color: '#00bfff', fill: true }
    }).setOrigin(0.5));
    startGroup.add(scene.add.text(CANVAS_W/2, 122, 'MATCH', {
        font: '40px "Press Start 2P"', fill: '#7fdbff',
        stroke: '#004488', strokeThickness: 4
    }).setOrigin(0.5));
    startGroup.add(scene.add.text(CANVAS_W/2, 168, 'Water Treatment Puzzle', {
        font: '8px "Press Start 2P"', fill: '#4a90d9'
    }).setOrigin(0.5));

    // Contaminant legend
    const legendItems = [
        { color: BACTERIA, desc: 'Bacteria  — treat with red' },
        { color: ALGAE,    desc: 'Algae       — treat with green' },
        { color: RUST,     desc: 'Sediment — treat with orange' },
    ];
    legendItems.forEach((item, i) => {
        const col = COLORS[item.color];
        const ly = 210 + i * 46;
        const circle = scene.add.graphics();
        circle.fillStyle(col.fill, 1);
        circle.fillCircle(CANVAS_W/2 - 100, ly + 12, 11);
        circle.fillStyle(col.light, 0.55);
        circle.fillCircle(CANVAS_W/2 - 103, ly + 9, 5);
        startGroup.add(circle);
        startGroup.add(scene.add.text(CANVAS_W/2 - 82, ly + 6, item.desc, {
            font: '7px "Press Start 2P"', fill: '#ccddff'
        }));
    });

    // Instructions
    const instrY = 364;
    [
        ['← →',  'Move capsule'],
        ['↑ / Z', 'Rotate CW'],
        ['X',     'Rotate CCW'],
        ['↓',    'Drop faster'],
        ['P',     'Pause'],
    ].forEach(([key, desc], i) => {
        startGroup.add(scene.add.text(CANVAS_W/2 - 130, instrY + i*24, key, {
            font: '8px "Press Start 2P"', fill: '#00bfff'
        }));
        startGroup.add(scene.add.text(CANVAS_W/2 - 30,  instrY + i*24, desc, {
            font: '8px "Press Start 2P"', fill: '#8899aa'
        }));
    });

    const goal = scene.add.text(CANVAS_W/2, 497, 'Match 4+ same color to treat contaminants!', {
        font: '7px "Press Start 2P"', fill: '#4a90d9',
        wordWrap: { width: 360 }, align: 'center'
    }).setOrigin(0.5);
    startGroup.add(goal);

    const startBtn = scene.add.text(CANVAS_W/2, 532, 'PRESS ENTER TO START', {
        font: '11px "Press Start 2P"', fill: '#ffffff'
    }).setOrigin(0.5);
    startGroup.add(startBtn);
    scene.tweens.add({ targets: startBtn, alpha: 0.1, duration: 600, yoyo: true, repeat: -1 });

    startGroup.add(scene.add.text(CANVAS_W/2, 562, '© 2026 SJWD Water District', {
        font: '7px "Press Start 2P"', fill: '#4a5568'
    }).setOrigin(0.5));

    scene.input.once('pointerdown', () => { initAudio(); startGame(); });
}

// --- Game flow ---
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    startGroup?.setVisible(false);
    resetState();
    startRound();
}

function restartGame() {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    hideOverlay('gameover');
    hideOverlay('levelclear');
    gameStarted = true;
    resetState();
    startRound();
}

function resetState() {
    level = 1; score = 0;
    gameOver = false; levelClear = false; paused = false;
    resolving = false; resolvePhase = 0; chainCount = 0;
    capsule = null; matchedCells = null;
    dasLeft = 0; dasRight = 0;
}

function startRound() {
    dropInterval = BASE_SPEED[level] || 60;
    dropTimer = 0;
    emptyBoard();
    placeContaminants(VIRUS_COUNT[level] || 4);
    nextColors = [randomColor(), randomColor()];
    spawnCapsule();
    updateHUD();
}
