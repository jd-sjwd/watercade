// Pipe Fitter (Mobile) - SJWD Water District
// Portrait-first build of the Tetris-style arcade game.
// Layout is 480x854 (9:16) and scales to fit any phone: a compact stat bar and
// NEXT preview across the top, a full-height board, and a row of thumb-sized
// buttons underneath. The board itself is also gesture-driven - drag sideways
// to shift the piece, drag down to soft drop, tap to rotate.

const GW = 480, GH = 854;

const COLS = 10, ROWS = 20;
const CELL = 34;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const BOARD_X = (GW - BOARD_W) / 2;
const BOARD_Y = 72;
const BOARD_BOTTOM = BOARD_Y + BOARD_H;

const CTRL_Y = 800;               // centre line of the button row
const PREVIEW_CX = 396, PREVIEW_CY = 34;
const PREVIEW_SCALE = 0.5;

const FONT = "'Press Start 2P', 'Courier New', monospace";
const GAME_ID = 'pipe-fitter';    // shares the leaderboard with the desktop build

const COLORS = {
    I: '#00bfff', O: '#ffff00', T: '#9b59b6',
    S: '#ff6600', Z: '#ff2222', L: '#2196f3', J: '#00cc66'
};
const COLOR_HEX = {
    I: 0x00bfff, O: 0xffff00, T: 0x9b59b6,
    S: 0xff6600, Z: 0xff2222, L: 0x2196f3, J: 0x00cc66
};
const DARK = {
    I: 0x007799, O: 0x999900, T: 0x6b3a7d,
    S: 0x994400, Z: 0x991111, L: 0x156aad, J: 0x008844
};

const PIECES = {
    I: [[[0,0],[1,0],[2,0],[3,0]], [[0,0],[0,1],[0,2],[0,3]]],
    O: [[[0,0],[1,0],[0,1],[1,1]]],
    T: [[[0,0],[1,0],[2,0],[1,1]], [[0,0],[0,1],[0,2],[1,1]], [[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[0,1]]],
    S: [[[1,0],[2,0],[0,1],[1,1]], [[0,0],[0,1],[1,1],[1,2]]],
    Z: [[[0,0],[1,0],[1,1],[2,1]], [[1,0],[1,1],[0,1],[0,2]]],
    L: [[[0,0],[0,1],[0,2],[1,2]], [[0,0],[1,0],[2,0],[0,1]], [[0,0],[1,0],[1,1],[1,2]], [[2,0],[0,1],[1,1],[2,1]]],
    J: [[[1,0],[1,1],[1,2],[0,2]], [[0,0],[0,1],[1,1],[2,1]], [[0,0],[1,0],[0,1],[0,2]], [[0,0],[1,0],[2,0],[2,1]]]
};

const config = {
    type: Phaser.AUTO,
    width: GW,
    height: GH,
    parent: 'game-container',
    backgroundColor: '#0a1628',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let board = [];
let currentPiece = null, nextPiece = null;
let score = 0, level = 1, lines = 0;
let scoreText, levelText, linesText, nextLabel;
let gameOver = false, gameStarted = false;
let startGroup, hudGroup, controlGroup;
let lbGroup = null;
let dropTime = 0, dropInterval = 800;
let boardGraphics, nextGraphics, ghostGraphics;
let lockDelay = 0, lockThreshold = 500;
let moveTimer = { left: 0, right: 0, down: 0 };
let dasDelay = 170, dasRate = 50;
let touchLeftHeld = false, touchRightHeld = false;

// --- Sound Effects (Web Audio API) ---
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

function sfxMove() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc.start(t); osc.stop(t + 0.04);
}

function sfxRotate() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.05);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.start(t); osc.stop(t + 0.06);
}

function sfxLock() {
    if (!audioCtx) return;
    // Metallic pipe clank
    const t = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc1.connect(g); osc2.connect(g); g.connect(audioCtx.destination);
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(900, t);
    osc1.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1400, t);
    osc2.frequency.exponentialRampToValueAtTime(350, t + 0.1);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc1.start(t); osc2.start(t);
    osc1.stop(t + 0.15); osc2.stop(t + 0.15);
}

function sfxDrop() {
    if (!audioCtx) return;
    // Heavy thud + metallic rattle
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.start(t); osc.stop(t + 0.18);
    // Rattle
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.08, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = audioCtx.createBufferSource(); n.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.07, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(f); f.connect(g2); g2.connect(audioCtx.destination);
    n.start(t); n.stop(t + 0.08);
}

function sfxClear(count) {
    if (!audioCtx) return;
    // Water flush whoosh + rising tone
    const t = audioCtx.currentTime;
    const bufSize = audioCtx.sampleRate * 0.5;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const n = audioCtx.createBufferSource(); n.buffer = buf;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.linearRampToValueAtTime(2200, t + 0.2);
    bp.frequency.linearRampToValueAtTime(400, t + 0.5);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
    n.start(t); n.stop(t + 0.5);
    // Rising pipe tone
    const osc = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    osc.connect(g2); g2.connect(audioCtx.destination);
    osc.type = 'sine';
    const baseFreq = count >= 4 ? 400 : 300;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 3, t + 0.35);
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.start(t); osc.stop(t + 0.4);
    // Extra drip notes for multi-line
    for (let i = 0; i < count; i++) {
        const o = audioCtx.createOscillator();
        const gn = audioCtx.createGain();
        o.connect(gn); gn.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(600 + i * 200, t + 0.1 + i * 0.08);
        gn.gain.setValueAtTime(0.06, t + 0.1 + i * 0.08);
        gn.gain.exponentialRampToValueAtTime(0.001, t + 0.2 + i * 0.08);
        o.start(t + 0.1 + i * 0.08); o.stop(t + 0.2 + i * 0.08);
    }
}

function sfxDrip() {
    if (!audioCtx) return;
    // Water drip on each gravity step
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.start(t); osc.stop(t + 0.06);
}

function sfxGameOver() {
    if (!audioCtx) return;
    // Descending pipe groan
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(60, t + 1);
    g.gain.setValueAtTime(0.08, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    osc.start(t); osc.stop(t + 1);
    // Burst noise
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = audioCtx.createBufferSource(); n.buffer = buf;
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.1, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    n.connect(lp); lp.connect(g2); g2.connect(audioCtx.destination);
    n.start(t); n.stop(t + 0.3);
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
    lbGroup.add(scene.add.rectangle(GW/2, GH/2, GW, GH, 0x000000, 0.9).setDepth(50));
    lbGroup.add(scene.add.text(GW/2, 110, 'PIPE BURST!', {
        fontFamily: FONT, fontSize: '26px', fill: '#ff4444',
        shadow: { blur: 10, color: '#ff0000', fill: true }
    }).setOrigin(0.5).setDepth(51));
    let ty = 176;
    subtitleLines.forEach(line => {
        lbGroup.add(scene.add.text(GW/2, ty, line, {
            fontFamily: FONT, fontSize: '13px', fill: '#ffff00'
        }).setOrigin(0.5).setDepth(51));
        ty += 32;
    });
    const lbY = ty + 20;
    lbGroup.add(scene.add.rectangle(GW/2, lbY, 400, 2, 0x2a4a6a).setDepth(51));
    lbGroup.add(scene.add.text(GW/2, lbY + 22, "TODAY'S TOP 5", {
        fontFamily: FONT, fontSize: '11px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51));
    const entries = scene._lbEntries || [];
    const myRank = scene._lbRank !== undefined ? scene._lbRank : -1;
    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#aaaaaa', '#888888'];
    entries.forEach((e, i) => {
        const ry = lbY + 62 + i * 38;
        const isMe = i === myRank;
        const col = isMe ? '#ffffff' : (rankColors[i] || '#888');
        if (isMe) lbGroup.add(scene.add.rectangle(GW/2, ry + 2, 400, 30, 0x1a3a5c).setDepth(51));
        lbGroup.add(scene.add.text(70, ry, '#' + (i+1), { fontFamily: FONT, fontSize: '11px', fill: rankColors[i] || '#888' }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(210, ry, e.name || '---', { fontFamily: FONT, fontSize: '11px', fill: col }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(400, ry, String(e.score), { fontFamily: FONT, fontSize: '11px', fill: col }).setOrigin(1, 0.5).setDepth(51));
    });
    if (!entries.length) {
        lbGroup.add(scene.add.text(GW/2, lbY + 80, 'No scores today yet', {
            fontFamily: FONT, fontSize: '9px', fill: '#4a5568'
        }).setOrigin(0.5).setDepth(51));
    }
    const btnY = lbY + 62 + 5 * 38 + 56;
    lbGroup.add(makeButton(scene, GW/2, btnY, 340, 72, 'PLAY AGAIN', 0x00bfff, '#00bfff', { onTap: () => restartPlay(scene) }));
    lbGroup.add(makeButton(scene, GW/2, btnY + 90, 340, 62, 'ARCADE HUB', 0x4a90d9, '#4a90d9', { onTap: () => { window.location.href = '../../mobile/'; }, fontSize: '11px' }));
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
        buzz(10);
        if (opts.onTap) opts.onTap();
        if (opts.onHoldStart) opts.onHoldStart();
    });
    bg.on('pointerup', release);
    bg.on('pointerout', release);
    bg.on('pointerupoutside', release);
    return c;
}

function preload() {}

function create() {
    const scene = this;

    for (let r = 0; r < ROWS; r++) {
        board[r] = [];
        for (let c = 0; c < COLS; c++) board[r][c] = null;
    }

    hudGroup = scene.add.group();

    // Board frame + grid
    hudGroup.add(scene.add.rectangle(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2, BOARD_W + 6, BOARD_H + 6)
        .setStrokeStyle(2, 0x2a4a6a).setFillStyle(0x0a1628));

    const gridGfx = scene.add.graphics();
    gridGfx.lineStyle(1, 0x1a2a3a, 0.5);
    for (let r = 0; r <= ROWS; r++) {
        gridGfx.lineBetween(BOARD_X, BOARD_Y + r * CELL, BOARD_X + BOARD_W, BOARD_Y + r * CELL);
    }
    for (let c = 0; c <= COLS; c++) {
        gridGfx.lineBetween(BOARD_X + c * CELL, BOARD_Y, BOARD_X + c * CELL, BOARD_Y + BOARD_H);
    }
    hudGroup.add(gridGfx);

    boardGraphics = scene.add.graphics().setDepth(5);
    ghostGraphics = scene.add.graphics().setDepth(4);
    nextGraphics = scene.add.graphics().setDepth(5);

    // Compact stat bar across the top
    const label = (x, t) => scene.add.text(x, 8, t, { fontFamily: FONT, fontSize: '7px', fill: '#7590a8' }).setDepth(10);
    hudGroup.add(label(14, 'SCORE'));
    hudGroup.add(label(150, 'LEVEL'));
    hudGroup.add(label(238, 'LINES'));
    scoreText = scene.add.text(14, 26, '0', { fontFamily: FONT, fontSize: '13px', fill: '#00bfff' }).setDepth(10);
    levelText = scene.add.text(150, 26, '1', { fontFamily: FONT, fontSize: '13px', fill: '#ffff00' }).setDepth(10);
    linesText = scene.add.text(238, 26, '0', { fontFamily: FONT, fontSize: '13px', fill: '#00ff7f' }).setDepth(10);
    hudGroup.add(scoreText); hudGroup.add(levelText); hudGroup.add(linesText);

    nextLabel = scene.add.text(300, 8, 'NEXT', { fontFamily: FONT, fontSize: '7px', fill: '#7590a8' }).setDepth(10);
    hudGroup.add(nextLabel);
    hudGroup.add(scene.add.rectangle(PREVIEW_CX, PREVIEW_CY, 128, 56)
        .setStrokeStyle(2, 0x2a4a6a).setFillStyle(0x0d1b2a).setDepth(1));

    // Keyboard still works on tablets with a keyboard attached.
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        rotate: Phaser.Input.Keyboard.KeyCodes.W,
        drop: Phaser.Input.Keyboard.KeyCodes.SPACE
    });
    scene.input.keyboard.on('keydown-UP', () => { if (gameStarted && !gameOver) rotatePiece(); });
    scene.input.keyboard.on('keydown-W', () => { if (gameStarted && !gameOver) rotatePiece(); });
    scene.input.keyboard.on('keydown-SPACE', () => { if (gameStarted && !gameOver) hardDrop(scene); });

    buildControls(scene);
    setupBoardGestures(scene);

    hudGroup.getChildren().forEach(o => o.setVisible(false));
    controlGroup.getChildren().forEach(o => o.setVisible(false));

    buildStartScreen(scene);
    buildGameOverScreen(scene);
}

// Button row under the board.
function buildControls(scene) {
    controlGroup = scene.add.group();
    const w = 110, h = 76, gap = 8;
    const x0 = gap + w / 2;
    const step = w + gap;

    controlGroup.add(makeButton(scene, x0, CTRL_Y, w, h, '◀', 0x4a90d9, '#7fdbff', {
        onHoldStart: () => { touchLeftHeld = true; },
        onHoldEnd: () => { touchLeftHeld = false; },
        fontSize: '20px'
    }));
    controlGroup.add(makeButton(scene, x0 + step, CTRL_Y, w, h, '↻', 0x9b59b6, '#d9a7ff', {
        onTap: () => { if (gameStarted && !gameOver) rotatePiece(); },
        fontSize: '24px'
    }));
    controlGroup.add(makeButton(scene, x0 + step * 2, CTRL_Y, w, h, '▶', 0x4a90d9, '#7fdbff', {
        onHoldStart: () => { touchRightHeld = true; },
        onHoldEnd: () => { touchRightHeld = false; },
        fontSize: '20px'
    }));
    controlGroup.add(makeButton(scene, x0 + step * 3, CTRL_Y, w, h, '⤓\nDROP', 0x00cc66, '#7fffb0', {
        onTap: () => { if (gameStarted && !gameOver) hardDrop(scene); },
        fontSize: '11px'
    }));
}

// Board gestures: drag sideways to shift a column at a time, drag down to soft
// drop, tap to rotate. Anchors advance by one CELL so a long drag keeps moving.
function setupBoardGestures(scene) {
    let active = false, anchorX = 0, anchorY = 0, moved = false, startTime = 0;

    const onBoard = (p) => p.y >= BOARD_Y - 20 && p.y <= BOARD_BOTTOM + 10;

    scene.input.on('pointerdown', (p, overObjects) => {
        initAudio();
        // A button under the finger already handled this press.
        if (overObjects && overObjects.length) return;
        if (!gameStarted || gameOver || !onBoard(p)) return;
        active = true; moved = false;
        anchorX = p.x; anchorY = p.y;
        startTime = scene.time.now;
    });

    scene.input.on('pointermove', (p) => {
        if (!active || !p.isDown || !currentPiece) return;
        while (p.x - anchorX >= CELL) { movePiece(1, 0); anchorX += CELL; moved = true; }
        while (anchorX - p.x >= CELL) { movePiece(-1, 0); anchorX -= CELL; moved = true; }
        while (p.y - anchorY >= CELL) {
            if (!movePiece(0, 1)) break;
            anchorY += CELL; moved = true;
            dropTime = 0; lockDelay = 0;
        }
    });

    scene.input.on('pointerup', (p) => {
        if (!active) return;
        active = false;
        // A quick tap that did not drag is a rotate.
        if (!moved && scene.time.now - startTime < 300 && gameStarted && !gameOver) {
            rotatePiece();
            buzz(8);
        }
    });
}

function update(time, delta) {
    if (!gameStarted || gameOver) return;
    const scene = this;

    if (!currentPiece) {
        spawnPiece(scene);
        return;
    }

    handleDAS(scene, delta);

    dropTime += delta;
    if (scene.cursors.down.isDown || (scene.wasd && scene.wasd.down.isDown)) {
        dropTime += delta * 3;
    }

    if (dropTime >= dropInterval) {
        dropTime = 0;
        if (!movePiece(0, 1)) {
            lockDelay += dropInterval;
            if (lockDelay >= lockThreshold) {
                lockPiece(scene);
            }
        } else {
            lockDelay = 0;
        }
    }

    drawBoard(scene);
}

function handleDAS(scene, delta) {
    const leftDown = scene.cursors.left.isDown || (scene.wasd && scene.wasd.left.isDown) || touchLeftHeld;
    const rightDown = scene.cursors.right.isDown || (scene.wasd && scene.wasd.right.isDown) || touchRightHeld;

    if (leftDown) {
        if (moveTimer.left === 0) { movePiece(-1, 0); moveTimer.left = 1; }
        else { moveTimer.left += delta; }
        if (moveTimer.left > dasDelay && (moveTimer.left - dasDelay) % dasRate < delta) {
            movePiece(-1, 0);
        }
    } else { moveTimer.left = 0; }

    if (rightDown) {
        if (moveTimer.right === 0) { movePiece(1, 0); moveTimer.right = 1; }
        else { moveTimer.right += delta; }
        if (moveTimer.right > dasDelay && (moveTimer.right - dasDelay) % dasRate < delta) {
            movePiece(1, 0);
        }
    } else { moveTimer.right = 0; }
}

function spawnPiece(scene) {
    if (!nextPiece) nextPiece = randomPiece();
    currentPiece = nextPiece;
    nextPiece = randomPiece();
    currentPiece.x = Math.floor(COLS / 2) - 1;
    currentPiece.y = 0;
    currentPiece.rot = 0;
    lockDelay = 0;
    dropTime = 0;

    if (collides(currentPiece.x, currentPiece.y, currentPiece.rot)) {
        endGame(scene);
    }
}

function randomPiece() {
    const types = Object.keys(PIECES);
    const type = types[Phaser.Math.Between(0, types.length - 1)];
    return { type, x: 0, y: 0, rot: 0 };
}

function getCells(piece, rot) {
    const rots = PIECES[piece.type];
    return rots[rot !== undefined ? rot % rots.length : piece.rot % rots.length];
}

function collides(x, y, rot) {
    const cells = getCells(currentPiece, rot);
    for (const [cx, cy] of cells) {
        const nx = x + cx, ny = y + cy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
    }
    return false;
}

function movePiece(dx, dy) {
    if (!currentPiece) return false;
    const nx = currentPiece.x + dx;
    const ny = currentPiece.y + dy;
    if (!collides(nx, ny, currentPiece.rot)) {
        currentPiece.x = nx;
        currentPiece.y = ny;
        if (dx !== 0) sfxMove();
        if (dy > 0) sfxDrip();
        return true;
    }
    return false;
}

function rotatePiece() {
    if (!currentPiece) return;
    const rots = PIECES[currentPiece.type].length;
    const newRot = (currentPiece.rot + 1) % rots;
    if (!collides(currentPiece.x, currentPiece.y, newRot)) {
        currentPiece.rot = newRot;
        sfxRotate();
        return;
    }
    for (const kick of [-1, 1, -2, 2]) {
        if (!collides(currentPiece.x + kick, currentPiece.y, newRot)) {
            currentPiece.x += kick;
            currentPiece.rot = newRot;
            sfxRotate();
            return;
        }
    }
}

function hardDrop(scene) {
    if (!currentPiece) return;
    while (movePiece(0, 1)) { score += 2; }
    sfxDrop();
    buzz(18);
    lockPiece(scene);
}

function getGhostY() {
    let gy = currentPiece.y;
    while (!collides(currentPiece.x, gy + 1, currentPiece.rot)) gy++;
    return gy;
}

function lockPiece(scene) {
    const cells = getCells(currentPiece, currentPiece.rot);
    for (const [cx, cy] of cells) {
        const bx = currentPiece.x + cx;
        const by = currentPiece.y + cy;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
            board[by][bx] = currentPiece.type;
        }
    }
    sfxLock();
    currentPiece = null;
    lockDelay = 0;
    clearLines(scene);
}

function clearLines(scene) {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(c => c !== null)) {
            flushAnimation(scene, r);
            board.splice(r, 1);
            board.unshift(new Array(COLS).fill(null));
            cleared++;
            r++; // recheck row
        }
    }
    if (cleared > 0) {
        const points = [0, 100, 300, 500, 800];
        score += (points[cleared] || 800) * level;
        lines += cleared;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(80, 800 - (level - 1) * 70);

        scoreText.setText(String(score));
        levelText.setText(String(level));
        linesText.setText(String(lines));

        sfxClear(cleared);
        buzz(cleared >= 4 ? [20, 40, 20, 40, 20] : 20);

        if (cleared >= 4) {
            showFloating(scene, BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2, 'WATER FLOW\nBONUS!', '#00ffff');
        }
    }
}

function flushAnimation(scene, row) {
    const y = BOARD_Y + row * CELL + CELL / 2;
    for (let c = 0; c < COLS; c++) {
        const x = BOARD_X + c * CELL + CELL / 2;
        const p = scene.add.circle(x, y, CELL / 2 - 2, 0x00bfff, 0.8).setDepth(15);
        scene.tweens.add({
            targets: p, alpha: 0, scale: 0.2,
            x: x + Phaser.Math.Between(-20, 20),
            duration: 400, delay: c * 30,
            onComplete: () => p.destroy()
        });
    }
}

// --- Neighbor connectivity helpers ---
function getBoardNeighbors(r, c) {
    return {
        up:    r > 0 && board[r - 1][c] !== null,
        down:  r < ROWS - 1 && board[r + 1][c] !== null,
        left:  c > 0 && board[r][c - 1] !== null,
        right: c < COLS - 1 && board[r][c + 1] !== null
    };
}

function getCellNeighbors(cells, cx, cy) {
    return {
        up:    cells.some(([x, y]) => x === cx && y === cy - 1),
        down:  cells.some(([x, y]) => x === cx && y === cy + 1),
        left:  cells.some(([x, y]) => x === cx - 1 && y === cy),
        right: cells.some(([x, y]) => x === cx + 1 && y === cy)
    };
}

function drawBoard(scene) {
    boardGraphics.clear();
    ghostGraphics.clear();
    nextGraphics.clear();

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) {
                const conn = getBoardNeighbors(r, c);
                drawPipeCell(boardGraphics, BOARD_X + c * CELL, BOARD_Y + r * CELL, board[r][c], 1, conn);
            }
        }
    }

    if (currentPiece) {
        const cells = getCells(currentPiece, currentPiece.rot);

        const gy = getGhostY();
        cells.forEach(([cx, cy]) => {
            const px = BOARD_X + (currentPiece.x + cx) * CELL;
            const py = BOARD_Y + (gy + cy) * CELL;
            const conn = getCellNeighbors(cells, cx, cy);
            drawGhostPipe(ghostGraphics, px, py, currentPiece.type, conn);
        });

        cells.forEach(([cx, cy]) => {
            const px = BOARD_X + (currentPiece.x + cx) * CELL;
            const py = BOARD_Y + (currentPiece.y + cy) * CELL;
            const conn = getCellNeighbors(cells, cx, cy);
            drawPipeCell(boardGraphics, px, py, currentPiece.type, 1, conn);
        });
    }

    // Next piece preview: drawn in board-cell units, then scaled down and
    // positioned so the piece centres inside the small preview box.
    if (nextPiece) {
        const previewCells = getCells(nextPiece, 0);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        previewCells.forEach(([cx, cy]) => {
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;
        });
        const pieceW = (maxX - minX + 1) * CELL * PREVIEW_SCALE;
        const pieceH = (maxY - minY + 1) * CELL * PREVIEW_SCALE;
        nextGraphics.setScale(PREVIEW_SCALE);
        nextGraphics.setPosition(
            PREVIEW_CX - pieceW / 2 - minX * CELL * PREVIEW_SCALE,
            PREVIEW_CY - pieceH / 2 - minY * CELL * PREVIEW_SCALE
        );
        previewCells.forEach(([cx, cy]) => {
            const conn = getCellNeighbors(previewCells, cx, cy);
            drawPipeCell(nextGraphics, cx * CELL, cy * CELL, nextPiece.type, 1, conn);
        });
    }

    const topFilled = board.slice(0, 4).some(row => row.some(c => c !== null));
    if (topFilled) {
        boardGraphics.fillStyle(0xff0000, 0.05 + Math.sin(Date.now() / 300) * 0.05);
        boardGraphics.fillRect(BOARD_X, BOARD_Y, BOARD_W, 4 * CELL);
    }
}

// --- Pipe rendering (proportional to CELL so it stays crisp when scaled up) ---
const PW = Math.round(CELL * 0.54);   // pipe outer width
const HPW = PW / 2;                   // half pipe width
const WALL = 2;                       // pipe wall thickness
const IW = PW - WALL * 2;             // inner channel width
const FW = Math.round(CELL * 0.69);   // flange width
const HFW = FW / 2;                   // half flange width
const FT = 3;                         // flange thickness
const WATER_W = Math.max(4, Math.round(CELL * 0.16)); // water channel width

function drawPipeCell(gfx, x, y, type, alpha, conn) {
    const S = CELL;
    const cx = S / 2;
    const cy = S / 2;
    const color = COLOR_HEX[type];
    const dark = DARK[type];

    const hasL = conn.left, hasR = conn.right, hasU = conn.up, hasD = conn.down;
    const hasH = hasL || hasR;
    const hasV = hasU || hasD;

    if (hasH) {
        const lx = hasL ? 0 : cx - HPW;
        const rx = hasR ? S : cx + HPW;
        const w = rx - lx;
        gfx.fillStyle(dark, alpha);
        gfx.fillRect(x + lx, y + cy - HPW, w, PW);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x + lx, y + cy - HPW + WALL, w, IW);
        gfx.fillStyle(0xffffff, alpha * 0.25);
        gfx.fillRect(x + lx, y + cy - HPW + WALL, w, 2);
        gfx.fillStyle(0x000000, alpha * 0.15);
        gfx.fillRect(x + lx, y + cy + HPW - WALL - 1, w, 2);
        gfx.fillStyle(0x00cfff, alpha * 0.35);
        gfx.fillRect(x + lx, y + cy - WATER_W / 2, w, WATER_W);

        if (!hasL) {
            gfx.fillStyle(dark, alpha);
            gfx.fillRect(x + cx - HPW, y + cy - HPW, 3, PW);
            gfx.fillStyle(color, alpha * 0.7);
            gfx.fillRect(x + cx - HPW + 1, y + cy - HPW + WALL, 1, IW);
        }
        if (!hasR) {
            gfx.fillStyle(dark, alpha);
            gfx.fillRect(x + cx + HPW - 3, y + cy - HPW, 3, PW);
            gfx.fillStyle(color, alpha * 0.7);
            gfx.fillRect(x + cx + HPW - 2, y + cy - HPW + WALL, 1, IW);
        }

        if (hasL) {
            gfx.fillStyle(dark, alpha * 0.9);
            gfx.fillRect(x, y + cy - HFW, FT, FW);
            gfx.fillStyle(color, alpha * 0.6);
            gfx.fillRect(x + 1, y + cy - HFW + 1, FT - 1, FW - 2);
            gfx.fillStyle(0xaaaaaa, alpha * 0.7);
            gfx.fillCircle(x + 1, y + cy - HFW + 2, 1.5);
            gfx.fillCircle(x + 1, y + cy + HFW - 2, 1.5);
        }
        if (hasR) {
            gfx.fillStyle(dark, alpha * 0.9);
            gfx.fillRect(x + S - FT, y + cy - HFW, FT, FW);
            gfx.fillStyle(color, alpha * 0.6);
            gfx.fillRect(x + S - FT, y + cy - HFW + 1, FT - 1, FW - 2);
            gfx.fillStyle(0xaaaaaa, alpha * 0.7);
            gfx.fillCircle(x + S - 2, y + cy - HFW + 2, 1.5);
            gfx.fillCircle(x + S - 2, y + cy + HFW - 2, 1.5);
        }
    }

    if (hasV) {
        const ty = hasU ? 0 : cy - HPW;
        const by = hasD ? S : cy + HPW;
        const h = by - ty;
        gfx.fillStyle(dark, alpha);
        gfx.fillRect(x + cx - HPW, y + ty, PW, h);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x + cx - HPW + WALL, y + ty, IW, h);
        gfx.fillStyle(0xffffff, alpha * 0.25);
        gfx.fillRect(x + cx - HPW + WALL, y + ty, 2, h);
        gfx.fillStyle(0x000000, alpha * 0.15);
        gfx.fillRect(x + cx + HPW - WALL - 1, y + ty, 2, h);
        gfx.fillStyle(0x00cfff, alpha * 0.35);
        gfx.fillRect(x + cx - WATER_W / 2, y + ty, WATER_W, h);

        if (!hasU) {
            gfx.fillStyle(dark, alpha);
            gfx.fillRect(x + cx - HPW, y + cy - HPW, PW, 3);
            gfx.fillStyle(color, alpha * 0.7);
            gfx.fillRect(x + cx - HPW + WALL, y + cy - HPW + 1, IW, 1);
        }
        if (!hasD) {
            gfx.fillStyle(dark, alpha);
            gfx.fillRect(x + cx - HPW, y + cy + HPW - 3, PW, 3);
            gfx.fillStyle(color, alpha * 0.7);
            gfx.fillRect(x + cx - HPW + WALL, y + cy + HPW - 2, IW, 1);
        }

        if (hasU) {
            gfx.fillStyle(dark, alpha * 0.9);
            gfx.fillRect(x + cx - HFW, y, FW, FT);
            gfx.fillStyle(color, alpha * 0.6);
            gfx.fillRect(x + cx - HFW + 1, y + 1, FW - 2, FT - 1);
            gfx.fillStyle(0xaaaaaa, alpha * 0.7);
            gfx.fillCircle(x + cx - HFW + 2, y + 1, 1.5);
            gfx.fillCircle(x + cx + HFW - 2, y + 1, 1.5);
        }
        if (hasD) {
            gfx.fillStyle(dark, alpha * 0.9);
            gfx.fillRect(x + cx - HFW, y + S - FT, FW, FT);
            gfx.fillStyle(color, alpha * 0.6);
            gfx.fillRect(x + cx - HFW + 1, y + S - FT, FW - 2, FT - 1);
            gfx.fillStyle(0xaaaaaa, alpha * 0.7);
            gfx.fillCircle(x + cx - HFW + 2, y + S - 2, 1.5);
            gfx.fillCircle(x + cx + HFW - 2, y + S - 2, 1.5);
        }
    }

    if (hasH && hasV) {
        gfx.fillStyle(dark, alpha);
        gfx.fillRect(x + cx - HPW - 1, y + cy - HPW - 1, PW + 2, PW + 2);
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x + cx - HPW + 1, y + cy - HPW + 1, PW - 2, PW - 2);
        gfx.fillStyle(0xcccccc, alpha * 0.6);
        gfx.fillCircle(x + cx, y + cy, 3);
        gfx.fillStyle(0xffffff, alpha * 0.3);
        gfx.fillCircle(x + cx - 0.5, y + cy - 0.5, 1.2);
    }

    if (!hasH && !hasV) {
        gfx.fillStyle(dark, alpha);
        gfx.fillRoundedRect(x + 3, y + 3, S - 6, S - 6, 4);
        gfx.fillStyle(color, alpha);
        gfx.fillRoundedRect(x + 5, y + 5, S - 10, S - 10, 3);
        gfx.fillStyle(0xffffff, alpha * 0.2);
        gfx.fillRoundedRect(x + 6, y + 6, S - 12, 3, 1);
        gfx.fillStyle(0xcccccc, alpha * 0.5);
        gfx.fillCircle(x + cx, y + cy, 3);
    }
}

// Ghost pipe - outline version showing pipe connectivity
function drawGhostPipe(gfx, x, y, type, conn) {
    const S = CELL;
    const cx = S / 2;
    const cy = S / 2;
    const color = COLOR_HEX[type];
    const a = 0.3;

    if (conn.left || conn.right) {
        const lx = conn.left ? 0 : cx - HPW;
        const rx = conn.right ? S : cx + HPW;
        gfx.lineStyle(1.5, color, a);
        gfx.strokeRect(x + lx, y + cy - HPW, rx - lx, PW);
    }
    if (conn.up || conn.down) {
        const ty = conn.up ? 0 : cy - HPW;
        const by = conn.down ? S : cy + HPW;
        gfx.lineStyle(1.5, color, a);
        gfx.strokeRect(x + cx - HPW, y + ty, PW, by - ty);
    }
    if (!conn.left && !conn.right && !conn.up && !conn.down) {
        gfx.lineStyle(1.5, color, a);
        gfx.strokeRect(x + 4, y + 4, S - 8, S - 8);
    }
}

function showFloating(scene, x, y, msg, color) {
    const txt = scene.add.text(x, y, msg, {
        fontFamily: FONT, fontSize: '14px', fill: color, align: 'center'
    }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({ targets: txt, y: y - 60, alpha: 0, duration: 1000, onComplete: () => txt.destroy() });
}

function endGame(scene) {
    gameOver = true;
    sfxGameOver();
    buzz([60, 60, 120]);
    // Controls sit above the overlay depth, so take them off screen entirely.
    controlGroup.getChildren().forEach(o => o.setVisible(false));
    touchLeftHeld = false; touchRightHeld = false;
    const subtitleLines = ['SCORE: ' + score, 'LEVEL: ' + level, 'LINES: ' + lines];
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
}

// UI Screens
function buildStartScreen(scene) {
    startGroup = scene.add.group();
    startGroup.add(scene.add.rectangle(GW/2, GH/2, GW, GH, 0x000000, 0.94).setDepth(50));

    // SJWD Logo
    startGroup.add(scene.add.rectangle(GW/2, 118, 160, 104, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51));
    startGroup.add(scene.add.rectangle(GW/2, 88, 136, 18, 0xffffff).setDepth(51));
    startGroup.add(scene.add.text(GW/2, 116, 'SJWD', { fontFamily: 'Arial', fontSize: '28px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(GW/2, 150, 'WATER DISTRICT', { fontFamily: 'Arial', fontSize: '9px', fill: '#000', backgroundColor: '#fff', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(GW/2, 236, 'PIPE FITTER', { fontFamily: FONT, fontSize: '24px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(GW/2, 270, 'Build the Pipeline!', { fontFamily: FONT, fontSize: '11px', fill: '#fff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(GW/2, 356, 'Fit pipe segments\ntogether to build\ncomplete pipelines!\n\nClear rows to flush\nwater through!', {
        fontFamily: FONT, fontSize: '11px', fill: '#aaa', align: 'center', lineSpacing: 10
    }).setOrigin(0.5).setDepth(51));

    // Pipe piece icons
    const legendGfx = scene.add.graphics().setDepth(51);
    startGroup.add(legendGfx);
    const pcs = [
        { n: 'Straight', c: COLORS.I, hex: COLOR_HEX.I, dk: DARK.I },
        { n: 'Elbow', c: COLORS.L, hex: COLOR_HEX.L, dk: DARK.L },
        { n: 'T-Joint', c: COLORS.T, hex: COLOR_HEX.T, dk: DARK.T },
        { n: 'Valve', c: COLORS.O, hex: COLOR_HEX.O, dk: DARK.O }
    ];
    const iy = 470;
    pcs.forEach((p, i) => {
        const lx = 78 + i * 108;
        if (i === 0) {
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 18, iy + 3, 36, 12);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 18, iy + 5, 36, 8);
            legendGfx.fillStyle(0xffffff, 0.25); legendGfx.fillRect(lx - 18, iy + 5, 36, 2);
        } else if (i === 1) {
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 6, iy - 6, 12, 21);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 4, iy - 6, 8, 21);
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 6, iy + 5, 24, 12);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 6, iy + 7, 24, 8);
        } else if (i === 2) {
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 18, iy - 2, 36, 12);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 18, iy, 36, 8);
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 6, iy + 2, 12, 16);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 4, iy + 2, 8, 16);
        } else {
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRoundedRect(lx - 12, iy - 4, 24, 24, 3);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRoundedRect(lx - 10, iy - 2, 20, 20, 2);
            legendGfx.fillStyle(0xcccccc, 0.5); legendGfx.fillCircle(lx, iy + 8, 3);
        }
        startGroup.add(scene.add.text(lx, iy + 26, p.n, { fontFamily: FONT, fontSize: '7px', fill: p.c }).setOrigin(0.5, 0).setDepth(51));
    });

    startGroup.add(scene.add.text(GW/2, 552, 'BUTTONS BELOW, OR ON THE BOARD:\nDRAG = MOVE   TAP = ROTATE', {
        fontFamily: FONT, fontSize: '8px', fill: '#00bfff', align: 'center', lineSpacing: 8
    }).setOrigin(0.5).setDepth(51));

    startGroup.add(makeButton(scene, GW/2, 648, 340, 80, 'START FITTING', 0x00bfff, '#00bfff', { onTap: () => startPlay(scene), fontSize: '14px' }).setDepth(51));
    startGroup.add(makeButton(scene, GW/2, 750, 260, 60, 'ARCADE HUB', 0x4a90d9, '#4a90d9', { onTap: () => { window.location.href = '../../mobile/'; }, fontSize: '10px' }).setDepth(51));

    scene.input.keyboard.on('keydown-ENTER', () => { if (!gameStarted) startPlay(scene); });
}

function buildGameOverScreen(scene) {
    // Game over UI is built on demand by showGameOverScreen()
    scene.input.keyboard.on('keydown-ENTER', () => { if (gameOver) restartPlay(scene); });
    scene.input.keyboard.on('keydown-SPACE', () => { if (gameOver) restartPlay(scene); });
}

function startPlay(scene) {
    initAudio();
    gameStarted = true;
    // Snapshot first: destroy() removes each child from the group as it runs.
    [...startGroup.getChildren()].forEach(c => c.destroy());
    hudGroup.getChildren().forEach(o => o.setVisible(true));
    controlGroup.getChildren().forEach(o => o.setVisible(true));
    spawnPiece(scene);
}

function restartPlay(scene) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    score = 0; level = 1; lines = 0;
    gameOver = false;
    dropInterval = 800;
    dropTime = 0; lockDelay = 0;
    currentPiece = null; nextPiece = null;
    touchLeftHeld = false; touchRightHeld = false;
    moveTimer = { left: 0, right: 0, down: 0 };
    controlGroup.getChildren().forEach(o => o.setVisible(true));

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) board[r][c] = null;
    }

    scoreText.setText('0');
    levelText.setText('1');
    linesText.setText('0');

    boardGraphics.clear();
    ghostGraphics.clear();
    nextGraphics.clear();

    spawnPiece(scene);
}
