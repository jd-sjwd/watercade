// Aqua Match (Mobile) - SJWD Water District
// Portrait-first build of the Dr. Mario-style water treatment puzzle.
// Layout is 480x854 (9:16) and scales to fit any phone: the desktop side panel
// becomes a stat bar across the top, the board fills the middle at 40px cells,
// and a row of thumb-sized buttons sits underneath. The board is also
// gesture-driven - drag sideways to move, drag down to drop, tap to rotate.

const FONT = "'Press Start 2P', 'Courier New', monospace";
const GAME_ID = 'aqua-match';     // shares the leaderboard with the desktop build

// --- Canvas / board dimensions ---
const CANVAS_W = 480;
const CANVAS_H = 854;

const COLS = 8;
const ROWS = 16;
const CELL = 40;

const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const BOARD_X = (CANVAS_W - BOARD_W) / 2;
const BOARD_Y = 106;
const BOARD_BOTTOM = BOARD_Y + BOARD_H;

const CTRL_Y = 800;               // centre line of the button row
const PREVIEW_CX = 402, PREVIEW_CY = 36;
const PREVIEW_CELL = 30;

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
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
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
let touchDownHeld = false;

// Phaser objects
let gfx, overlayGfx;
let scoreText, levelText, virusText;
let startGroup, hudGroup, controlGroup;
let lbGroup = null;

// --- Audio ---
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS/Android suspend the context until a gesture resumes it.
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function buzz(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
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
function saveLBData(e) { try { localStorage.setItem(lbKey(), JSON.stringify(e)); } catch(e) {} }
function isTopScore(s) { const lb = getLB(); return s > 0 && (lb.length < 5 || s > lb[lb.length - 1].score); }
function addLBEntry(name, s) {
    const lb = getLB(), ts = Date.now();
    lb.push({ name: name.slice(0, 12).toUpperCase(), score: s, ts });
    lb.sort((a, b) => b.score - a.score || a.ts - b.ts);
    const top5 = lb.slice(0, 5);
    saveLBData(top5);
    return { entries: top5, rank: top5.findIndex(e => e.ts === ts) };
}
// Name entry sits at the top of the screen so the on-screen keyboard never
// covers it, and uses a 16px input so iOS does not zoom the page on focus.
function showNameEntry(playerScore, onSubmit) {
    const ol = document.createElement('div');
    ol.id = 'sjwd-name-overlay';
    Object.assign(ol.style, {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start', zIndex: 9999,
        padding: 'calc(env(safe-area-inset-top) + 24px) 16px 16px',
        fontFamily: FONT, color: '#fff', textAlign: 'center'
    });
    ol.innerHTML = `
        <div style="font-size:14px;color:#ff4444;margin-bottom:18px;text-shadow:0 0 10px #ff0000;line-height:1.6">NEW<br>HIGH SCORE!</div>
        <div style="font-size:11px;color:#ffff00;margin-bottom:10px">SCORE: ${playerScore}</div>
        <div style="font-size:9px;color:#aaa;margin-bottom:16px">Enter your name:</div>
        <input id="sjwd-name-input" maxlength="12" autocomplete="off" autocapitalize="characters" enterkeyhint="done"
            style="font-family:${FONT};font-size:16px;background:#0d1b2a;color:#00bfff;
                   border:2px solid #00bfff;border-radius:6px;padding:12px 14px;
                   text-align:center;width:min(260px,80vw);outline:none;text-transform:uppercase;margin-bottom:20px">
        <button id="sjwd-name-submit"
            style="font-family:${FONT};font-size:12px;background:#4a5568;color:#00bfff;
                   border:2px solid #00bfff;border-radius:6px;padding:16px 32px;cursor:pointer">SUBMIT</button>`;
    document.body.appendChild(ol);
    const inp = document.getElementById('sjwd-name-input');
    const btn = document.getElementById('sjwd-name-submit');
    inp.focus();
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); });
    const submit = () => {
        const name = inp.value.trim() || 'AAA';
        inp.blur();
        document.body.removeChild(ol);
        onSubmit(name);
    };
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}
function showGameOverScreen(scene, subtitleLines) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    lbGroup = scene.add.group();
    lbGroup.add(scene.add.rectangle(CANVAS_W/2, CANVAS_H/2, CANVAS_W, CANVAS_H, 0x000000, 0.9).setDepth(50));
    lbGroup.add(scene.add.text(CANVAS_W/2, 116, 'GAME OVER', {
        fontFamily: FONT, fontSize: '26px', fill: '#ff4444',
        shadow: { blur: 10, color: '#ff0000', fill: true }
    }).setOrigin(0.5).setDepth(51));
    let ty = 186;
    subtitleLines.forEach(line => {
        lbGroup.add(scene.add.text(CANVAS_W/2, ty, line, {
            fontFamily: FONT, fontSize: '13px', fill: '#ffff00'
        }).setOrigin(0.5).setDepth(51));
        ty += 34;
    });
    const lbY = ty + 22;
    lbGroup.add(scene.add.rectangle(CANVAS_W/2, lbY, 400, 2, 0x2a4a6a).setDepth(51));
    lbGroup.add(scene.add.text(CANVAS_W/2, lbY + 22, "TODAY'S TOP 5", {
        fontFamily: FONT, fontSize: '11px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51));
    const entries = scene._lbEntries || [];
    const myRank = scene._lbRank !== undefined ? scene._lbRank : -1;
    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#aaaaaa', '#888888'];
    entries.forEach((e, i) => {
        const ry = lbY + 62 + i * 38;
        const isMe = i === myRank;
        const col = isMe ? '#ffffff' : (rankColors[i] || '#888');
        if (isMe) lbGroup.add(scene.add.rectangle(CANVAS_W/2, ry + 2, 400, 30, 0x1a3a5c).setDepth(51));
        lbGroup.add(scene.add.text(70, ry, '#' + (i+1), { fontFamily: FONT, fontSize: '11px', fill: rankColors[i] || '#888' }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(210, ry, e.name || '---', { fontFamily: FONT, fontSize: '11px', fill: col }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(400, ry, String(e.score), { fontFamily: FONT, fontSize: '11px', fill: col }).setOrigin(1, 0.5).setDepth(51));
    });
    if (!entries.length) {
        lbGroup.add(scene.add.text(CANVAS_W/2, lbY + 80, 'No scores today yet', {
            fontFamily: FONT, fontSize: '9px', fill: '#4a5568'
        }).setOrigin(0.5).setDepth(51));
    }
    const btnY = lbY + 62 + 5 * 38 + 56;
    lbGroup.add(makeButton(scene, CANVAS_W/2, btnY, 340, 72, 'PLAY AGAIN', 0x00bfff, '#00bfff', { onTap: () => restartGame() }));
    lbGroup.add(makeButton(scene, CANVAS_W/2, btnY + 90, 340, 62, 'ARCADE HUB', 0x4a90d9, '#4a90d9', { onTap: () => { window.location.href = '../../mobile/'; }, fontSize: '11px' }));
}

// Finger-sized canvas button. opts: { onTap, onHoldStart, onHoldEnd, fontSize }
function makeButton(scene, x, y, w, h, label, strokeHex, textColor, opts) {
    opts = opts || {};
    const bg = scene.add.rectangle(0, 0, w, h, 0x1a3a5c)
        .setStrokeStyle(3, strokeHex)
        .setInteractive({ useHandCursor: true });
    const txt = scene.add.text(0, 0, label, {
        fontFamily: FONT, fontSize: opts.fontSize || '13px', fill: textColor, align: 'center'
    }).setOrigin(0.5);
    const c = scene.add.container(x, y, [bg, txt]).setDepth(60).setSize(w, h);

    const release = () => {
        bg.setFillStyle(0x1a3a5c);
        if (opts.onHoldEnd) opts.onHoldEnd();
    };
    bg.on('pointerdown', () => {
        bg.setFillStyle(0x2a5a8c);
        initAudio();
        buzz(10);
        if (opts.onTap) opts.onTap();
        if (opts.onHoldStart) opts.onHoldStart();
    });
    bg.on('pointerup', release);
    bg.on('pointerout', release);
    bg.on('pointerupoutside', release);
    return c;
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
        buzz([60, 60, 120]);
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
    // dir: 1=CW, -1=CCW. Two CW turns swap the halves, so a single rotate
    // button is enough to reach every capsule arrangement.
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
    buzz(chainCount > 0 ? [15, 30, 15] : 15);

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
    const scene = this;
    gfx = this.add.graphics();
    overlayGfx = this.add.graphics().setDepth(2);

    hudGroup = this.add.group();

    // Stat bar across the top - the desktop side panel would squeeze the
    // board off a phone screen.
    const lbl = (x, t) => this.add.text(x, 14, t, { fontFamily: FONT, fontSize: '7px', fill: '#7590a8' }).setDepth(10);
    const val = (x, t, col) => this.add.text(x, 32, t, { fontFamily: FONT, fontSize: '13px', fill: col }).setDepth(10);
    hudGroup.add(lbl(14, 'SCORE'));   scoreText = val(14, '0', '#ffffff');
    hudGroup.add(lbl(180, 'LEVEL'));  levelText = val(180, '1', '#ffff00');
    hudGroup.add(lbl(268, 'BUGS'));   virusText = val(268, '0', '#ff7f7f');
    hudGroup.add(scoreText); hudGroup.add(levelText); hudGroup.add(virusText);

    // The NEXT box itself is painted in drawTopPanel() so the capsule preview
    // draws into the same graphics object and cannot end up behind it.
    hudGroup.add(this.add.text(306, 14, 'NEXT', { fontFamily: FONT, fontSize: '7px', fill: '#7590a8' }).setDepth(10));

    buildControls(this);
    setupBoardGestures(this);

    hudGroup.getChildren().forEach(o => o.setVisible(false));
    controlGroup.getChildren().forEach(o => o.setVisible(false));

    // Start screen
    buildStartScreen(this);

    // Keyboard (tablets with a keyboard attached)
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
}

function softDrop() {
    if (!capsule || resolving) return;
    if (!tryMove(0, 1)) lockCapsule();
}

// Button row under the board.
function buildControls(scene) {
    controlGroup = scene.add.group();
    const w = 110, h = 76, gap = 8;
    const x0 = gap + w / 2;
    const step = w + gap;
    const playable = () => gameStarted && !gameOver && !paused && !resolving && capsule;

    controlGroup.add(makeButton(scene, x0, CTRL_Y, w, h, '◀', 0x4a90d9, '#7fdbff', {
        onHoldStart: () => { if (playable()) { if (tryMove(-1, 0)) sfxMove(); dasLeft = -DAS_DELAY; } },
        onHoldEnd: () => { dasLeft = 0; },
        fontSize: '20px'
    }));
    controlGroup.add(makeButton(scene, x0 + step, CTRL_Y, w, h, '↻', 0x9b59b6, '#d9a7ff', {
        onTap: () => { if (playable()) { if (tryRotate(1)) sfxRotate(); } },
        fontSize: '24px'
    }));
    controlGroup.add(makeButton(scene, x0 + step * 2, CTRL_Y, w, h, '▶', 0x4a90d9, '#7fdbff', {
        onHoldStart: () => { if (playable()) { if (tryMove(1, 0)) sfxMove(); dasRight = -DAS_DELAY; } },
        onHoldEnd: () => { dasRight = 0; },
        fontSize: '20px'
    }));
    controlGroup.add(makeButton(scene, x0 + step * 3, CTRL_Y, w, h, '▼\nDROP', 0x44cc44, '#7fff7f', {
        onHoldStart: () => { if (playable()) { softDrop(); touchDownHeld = true; } },
        onHoldEnd: () => { touchDownHeld = false; },
        fontSize: '11px'
    }));
}

// Board gestures: drag sideways to move a column at a time, drag down to drop,
// tap to rotate. Anchors advance by one CELL so a long drag keeps moving.
function setupBoardGestures(scene) {
    let active = false, anchorX = 0, anchorY = 0, moved = false, startTime = 0;

    const onBoard = (p) => p.y >= BOARD_Y - 40 && p.y <= BOARD_BOTTOM + 10;
    const playable = () => gameStarted && !gameOver && !paused && !resolving && capsule;

    scene.input.on('pointerdown', (p, overObjects) => {
        initAudio();
        // A button under the finger already handled this press.
        if (overObjects && overObjects.length) return;
        if (!playable() || !onBoard(p)) return;
        active = true; moved = false;
        anchorX = p.x; anchorY = p.y;
        startTime = scene.time.now;
    });

    scene.input.on('pointermove', (p) => {
        if (!active || !p.isDown || !playable()) return;
        while (p.x - anchorX >= CELL) { if (tryMove(1, 0)) sfxMove(); anchorX += CELL; moved = true; }
        while (anchorX - p.x >= CELL) { if (tryMove(-1, 0)) sfxMove(); anchorX -= CELL; moved = true; }
        while (p.y - anchorY >= CELL) {
            if (!tryMove(0, 1)) break;
            anchorY += CELL; moved = true; dropTimer = 0;
        }
    });

    scene.input.on('pointerup', () => {
        if (!active) return;
        active = false;
        if (!moved && scene.time.now - startTime < 300 && playable()) {
            if (tryRotate(1)) sfxRotate();
            buzz(8);
        }
    });
}

function update(time, delta) {
    gfx.clear();
    overlayGfx.clear();

    if (!gameStarted) { animateStartBg(); return; }

    drawBoard();
    drawTopPanel();

    if (gameOver || levelClear) return;
    if (paused) { drawPauseOverlay(); return; }

    if (resolving) { stepResolve(delta); drawFlash(); return; }

    if (!capsule) return;

    // DAS
    if (dasLeft !== 0) { dasLeft += delta; if (dasLeft >= 0) { if (tryMove(-1,0)) sfxMove(); dasLeft -= DAS_RATE; } }
    if (dasRight !== 0) { dasRight += delta; if (dasRight >= 0) { if (tryMove(1,0))  sfxMove(); dasRight -= DAS_RATE; } }

    // Auto-drop. Holding DROP falls at a fixed fast rate rather than a
    // multiple of the level speed, so it feels the same at every level.
    dropTimer += delta;
    const interval = touchDownHeld ? Math.min(dropInterval, 55) : dropInterval;
    if (dropTimer >= interval) {
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
    for (let i = 0; i < 18; i++) {
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
        gfx.strokeRect(BOARD_X + c.x*CELL + 3, BOARD_Y + (c.y+drop)*CELL + 3, CELL-6, CELL-6);
    });
}

// size defaults to the board cell; the NEXT preview passes a smaller one.
function drawCapsuleHalf(g, px, py, color, side = 'single', size = CELL) {
    const col = COLORS[color];
    const pad = Math.max(2, Math.round(size * 0.06)), r = Math.round(size * 0.2);
    const x = px + pad, y = py + pad, w = size - pad*2, h = size - pad*2;

    // Shadow
    g.fillStyle(col.dark, 1);
    g.fillRoundedRect(x, y, w, h, r);

    // Body
    g.fillStyle(col.fill, 1);
    g.fillRoundedRect(x+1, y+1, w-2, h-2, r);

    // Shine
    g.fillStyle(col.light, 0.5);
    g.fillRoundedRect(x+4, y+3, w-Math.round(size*0.42), Math.floor(h*0.34), r/2);

    // Connection notch indicator (subtle darker strip on the flat edge)
    const inset = Math.round(size * 0.14);
    const thick = Math.max(3, Math.round(size * 0.09));
    g.fillStyle(col.dark, 0.35);
    if (side === 'left')   g.fillRect(px + size - thick - 2, py + inset, thick, size - inset*2);
    if (side === 'right')  g.fillRect(px + 2,                py + inset, thick, size - inset*2);
    if (side === 'top')    g.fillRect(px + inset, py + size - thick - 2, size - inset*2, thick);
    if (side === 'bottom') g.fillRect(px + inset, py + 2,                size - inset*2, thick);
}

function drawContaminant(g, px, py, color) {
    const col = COLORS[color];
    const cx = px + CELL / 2, cy = py + CELL / 2, r = CELL / 2 - 5;

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
    g.fillCircle(cx - 4, cy - 1, 2.5);
    g.fillCircle(cx + 4, cy - 1, 2.5);

    // Frown
    g.lineStyle(2, 0x000000, 1);
    g.beginPath();
    g.arc(cx, cy + 4, 5, 0.4, Math.PI - 0.4, false);
    g.strokePath();
}

function drawTopPanel() {
    gfx.fillStyle(0x0a1628, 0.9);
    gfx.fillRect(6, 6, CANVAS_W - 12, 62);
    gfx.lineStyle(2, 0x2a4a6a, 1);
    gfx.strokeRect(6, 6, CANVAS_W - 12, 62);

    gfx.fillStyle(0x0d1b2a, 1);
    gfx.fillRect(PREVIEW_CX - 62, PREVIEW_CY - 26, 124, 52);
    gfx.lineStyle(2, 0x2a4a6a, 1);
    gfx.strokeRect(PREVIEW_CX - 62, PREVIEW_CY - 26, 124, 52);

    if (nextColors) {
        const nx = PREVIEW_CX - PREVIEW_CELL, ny = PREVIEW_CY - PREVIEW_CELL / 2;
        drawCapsuleHalf(gfx, nx, ny, nextColors[0], 'left', PREVIEW_CELL);
        drawCapsuleHalf(gfx, nx + PREVIEW_CELL, ny, nextColors[1], 'right', PREVIEW_CELL);
    }
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

    if (type === 'gameover') {
        // Controls sit above the overlay depth, so take them off screen.
        controlGroup.getChildren().forEach(o => o.setVisible(false));
        dasLeft = 0; dasRight = 0; touchDownHeld = false;
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
        return;
    }

    const grp = scene.add.group();
    overlayRefs[type] = grp;

    const bg = scene.add.rectangle(CANVAS_W/2, CANVAS_H/2, CANVAS_W - 40, 230, 0x0a1628, 0.96)
        .setStrokeStyle(3, 0x44cc44).setDepth(70);
    grp.add(bg);

    grp.add(scene.add.text(CANVAS_W/2, CANVAS_H/2 - 72, 'WATER CLEAN!', {
        fontFamily: FONT, fontSize: '20px', fill: '#44cc44',
        shadow: { blur: 10, color: '#00ff00', fill: true }
    }).setOrigin(0.5).setDepth(71));
    grp.add(scene.add.text(CANVAS_W/2, CANVAS_H/2 - 26, `LEVEL ${level} COMPLETE`, {
        fontFamily: FONT, fontSize: '11px', fill: '#7fff7f'
    }).setOrigin(0.5).setDepth(71));
    grp.add(scene.add.text(CANVAS_W/2, CANVAS_H/2 + 16, `SCORE: ${score}`, {
        fontFamily: FONT, fontSize: '11px', fill: '#ffffff'
    }).setOrigin(0.5).setDepth(71));
    const next = scene.add.text(CANVAS_W/2, CANVAS_H/2 + 60, 'Next level incoming...', {
        fontFamily: FONT, fontSize: '8px', fill: '#aaccff'
    }).setOrigin(0.5).setDepth(71);
    grp.add(next);
    scene.tweens.add({ targets: next, alpha: 0.1, duration: 400, yoyo: true, repeat: -1 });
}

function hideOverlay(type) {
    if (overlayRefs[type]) { overlayRefs[type].destroy(true); delete overlayRefs[type]; }
}

// --- Start screen ---
function buildStartScreen(scene) {
    startGroup = scene.add.group();

    startGroup.add(scene.add.rectangle(CANVAS_W/2, CANVAS_H/2, CANVAS_W, CANVAS_H, 0x061428, 0.96).setDepth(50));

    startGroup.add(scene.add.text(CANVAS_W/2, 104, 'AQUA', {
        fontFamily: FONT, fontSize: '42px', fill: '#00bfff',
        stroke: '#004488', strokeThickness: 4,
        shadow: { blur: 14, color: '#00bfff', fill: true }
    }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(CANVAS_W/2, 162, 'MATCH', {
        fontFamily: FONT, fontSize: '42px', fill: '#7fdbff',
        stroke: '#004488', strokeThickness: 4
    }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(CANVAS_W/2, 212, 'Water Treatment Puzzle', {
        fontFamily: FONT, fontSize: '9px', fill: '#4a90d9'
    }).setOrigin(0.5).setDepth(51));

    // Contaminant legend
    const legendItems = [
        { color: BACTERIA, desc: 'Bacteria — clear with red' },
        { color: ALGAE,    desc: 'Algae — clear with green' },
        { color: RUST,     desc: 'Sediment — clear with orange' },
    ];
    legendItems.forEach((item, i) => {
        const col = COLORS[item.color];
        const ly = 274 + i * 52;
        const circle = scene.add.graphics().setDepth(51);
        circle.fillStyle(col.fill, 1);
        circle.fillCircle(56, ly, 13);
        circle.fillStyle(col.light, 0.55);
        circle.fillCircle(52, ly - 4, 6);
        startGroup.add(circle);
        startGroup.add(scene.add.text(84, ly, item.desc, {
            fontFamily: FONT, fontSize: '8px', fill: '#ccddff'
        }).setOrigin(0, 0.5).setDepth(51));
    });

    // Touch instructions
    const instrY = 452;
    [
        ['DRAG  ', 'Move the capsule'],
        ['TAP   ', 'Rotate it'],
        ['DROP  ', 'Fall faster'],
    ].forEach(([key, desc], i) => {
        startGroup.add(scene.add.text(40, instrY + i * 30, key, {
            fontFamily: FONT, fontSize: '9px', fill: '#00bfff'
        }).setDepth(51));
        startGroup.add(scene.add.text(150, instrY + i * 30, desc, {
            fontFamily: FONT, fontSize: '9px', fill: '#8899aa'
        }).setDepth(51));
    });

    startGroup.add(scene.add.text(CANVAS_W/2, 570, 'Match 4+ of the same colour\nto treat contaminants!', {
        fontFamily: FONT, fontSize: '9px', fill: '#4a90d9', align: 'center', lineSpacing: 10
    }).setOrigin(0.5).setDepth(51));

    startGroup.add(makeButton(scene, CANVAS_W/2, 664, 340, 80, 'START TREATING', 0x00bfff, '#00bfff',
        { onTap: () => startGame(), fontSize: '14px' }).setDepth(51));
    startGroup.add(makeButton(scene, CANVAS_W/2, 764, 260, 60, 'ARCADE HUB', 0x4a90d9, '#4a90d9',
        { onTap: () => { window.location.href = '../../mobile/'; }, fontSize: '10px' }).setDepth(51));
}

// --- Game flow ---
function startGame() {
    if (gameStarted) return;
    initAudio();
    gameStarted = true;
    // Snapshot first: destroy() removes each child from the group as it runs.
    [...startGroup.getChildren()].forEach(c => c.destroy());
    hudGroup.getChildren().forEach(o => o.setVisible(true));
    controlGroup.getChildren().forEach(o => o.setVisible(true));
    resetState();
    startRound();
}

function restartGame() {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    hideOverlay('levelclear');
    gameStarted = true;
    hudGroup.getChildren().forEach(o => o.setVisible(true));
    controlGroup.getChildren().forEach(o => o.setVisible(true));
    resetState();
    startRound();
}

function resetState() {
    level = 1; score = 0;
    gameOver = false; levelClear = false; paused = false;
    resolving = false; resolvePhase = 0; chainCount = 0;
    capsule = null; matchedCells = null;
    dasLeft = 0; dasRight = 0; touchDownHeld = false;
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
