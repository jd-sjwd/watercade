// Pipe Fitter - SJWD Water District
// Tetris-style arcade game

const COLS = 10, ROWS = 20;
const CELL = 26;
const BOARD_X = 30;
const BOARD_Y = 40;

const FONT = "'Press Start 2P', 'Courier New', monospace";
const GAME_ID = 'pipe-fitter';

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
    width: 480,
    height: 640,
    parent: 'game-container',
    backgroundColor: '#0a1628',
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let board = [];
let currentPiece = null, nextPiece = null;
let score = 0, level = 1, lines = 0;
let scoreText, levelText, linesText, nextLabel;
let gameOver = false, gameStarted = false;
let startGroup;
let lbGroup = null;
let dropTime = 0, dropInterval = 800;
let boardGraphics, nextGraphics, ghostGraphics;
let lockDelay = 0, lockThreshold = 500;
let moveTimer = { left: 0, right: 0, down: 0 };
let dasDelay = 170, dasRate = 50;

// --- Sound Effects (Web Audio API) ---
let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
    const CW = 480, CH = 640;
    lbGroup.add(scene.add.rectangle(CW/2, CH/2, CW, CH, 0x000000, 0.88).setDepth(50));
    lbGroup.add(scene.add.text(CW/2, 82, 'PIPE BURST!', {
        fontFamily: FONT, fontSize: '26px', fill: '#ff4444',
        shadow: { blur: 10, color: '#ff0000', fill: true }
    }).setOrigin(0.5).setDepth(51));
    let ty = 130;
    subtitleLines.forEach(line => {
        lbGroup.add(scene.add.text(CW/2, ty, line, {
            fontFamily: FONT, fontSize: '11px', fill: '#ffff00'
        }).setOrigin(0.5).setDepth(51));
        ty += 26;
    });
    const lbY = ty + 12;
    lbGroup.add(scene.add.rectangle(CW/2, lbY, 380, 2, 0x2a4a6a).setDepth(51));
    lbGroup.add(scene.add.text(CW/2, lbY + 14, "TODAY'S TOP 5", {
        fontFamily: FONT, fontSize: '9px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51));
    const entries = scene._lbEntries || [];
    const myRank = scene._lbRank !== undefined ? scene._lbRank : -1;
    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#aaaaaa', '#888888'];
    entries.forEach((e, i) => {
        const ry = lbY + 44 + i * 30;
        const isMe = i === myRank;
        const col = isMe ? '#ffffff' : (rankColors[i] || '#888');
        if (isMe) lbGroup.add(scene.add.rectangle(CW/2, ry + 2, 360, 22, 0x1a3a5c).setDepth(51));
        lbGroup.add(scene.add.text(100, ry, '#' + (i+1), { fontFamily: FONT, fontSize: '9px', fill: rankColors[i] || '#888' }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(210, ry, e.name || '---', { fontFamily: FONT, fontSize: '9px', fill: col }).setOrigin(0.5).setDepth(51));
        lbGroup.add(scene.add.text(370, ry, String(e.score), { fontFamily: FONT, fontSize: '9px', fill: col }).setOrigin(0.5).setDepth(51));
    });
    if (!entries.length) {
        lbGroup.add(scene.add.text(CW/2, lbY + 60, 'No scores today yet', {
            fontFamily: FONT, fontSize: '8px', fill: '#4a5568'
        }).setOrigin(0.5).setDepth(51));
    }
    const btnY = lbY + 44 + 5 * 30 + 22;
    const rBg = scene.add.rectangle(148, btnY, 196, 42, 0x4a5568).setStrokeStyle(2, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    lbGroup.add(rBg);
    const rTxt = scene.add.text(148, btnY, 'PLAY AGAIN', { fontFamily: FONT, fontSize: '10px', fill: '#00bfff' }).setOrigin(0.5).setDepth(52);
    lbGroup.add(rTxt);
    rBg.on('pointerover', () => { rBg.setFillStyle(0x718096); rTxt.setFill('#ffffff'); });
    rBg.on('pointerout',  () => { rBg.setFillStyle(0x4a5568); rTxt.setFill('#00bfff'); });
    rBg.on('pointerdown', () => restartPlay(scene));
    const hBg = scene.add.rectangle(332, btnY, 196, 42, 0x4a5568).setStrokeStyle(2, 0x4a90d9).setDepth(51).setInteractive({ useHandCursor: true });
    lbGroup.add(hBg);
    const hTxt = scene.add.text(332, btnY, 'ARCADE HUB', { fontFamily: FONT, fontSize: '10px', fill: '#4a90d9' }).setOrigin(0.5).setDepth(52);
    lbGroup.add(hTxt);
    hBg.on('pointerover', () => { hBg.setFillStyle(0x718096); hTxt.setFill('#ffffff'); });
    hBg.on('pointerout',  () => { hBg.setFillStyle(0x4a5568); hTxt.setFill('#4a90d9'); });
    hBg.on('pointerdown', () => { window.location.href = '../'; });
}

function preload() {}

function create() {
    const scene = this;

    // Init board
    for (let r = 0; r < ROWS; r++) {
        board[r] = [];
        for (let c = 0; c < COLS; c++) {
            board[r][c] = null;
        }
    }

    // Draw board border
    const boardW = COLS * CELL;
    const boardH = ROWS * CELL;
    scene.add.rectangle(BOARD_X + boardW / 2, BOARD_Y + boardH / 2, boardW + 4, boardH + 4)
        .setStrokeStyle(2, 0x2a4a6a).setFillStyle(0x0a1628);

    // Grid lines
    const gridGfx = scene.add.graphics();
    gridGfx.lineStyle(1, 0x1a2a3a, 0.5);
    for (let r = 0; r <= ROWS; r++) {
        gridGfx.lineBetween(BOARD_X, BOARD_Y + r * CELL, BOARD_X + boardW, BOARD_Y + r * CELL);
    }
    for (let c = 0; c <= COLS; c++) {
        gridGfx.lineBetween(BOARD_X + c * CELL, BOARD_Y, BOARD_X + c * CELL, BOARD_Y + boardH);
    }

    boardGraphics = scene.add.graphics().setDepth(5);
    ghostGraphics = scene.add.graphics().setDepth(4);
    nextGraphics = scene.add.graphics().setDepth(5);

    // HUD - right side
    const hx = 330;
    nextLabel = scene.add.text(hx, 50, 'NEXT', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '10px', fill: '#aaa'
    }).setDepth(10);

    scene.add.rectangle(hx + 50, 110, 110, 90).setStrokeStyle(2, 0x2a4a6a).setFillStyle(0x0d1b2a);

    scoreText = scene.add.text(hx, 200, 'SCORE\n0', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '10px', fill: '#00bfff', lineSpacing: 8
    }).setDepth(10);
    levelText = scene.add.text(hx, 270, 'LEVEL\n1', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '10px', fill: '#ffff00', lineSpacing: 8
    }).setDepth(10);
    linesText = scene.add.text(hx, 340, 'LINES\n0', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '10px', fill: '#00ff7f', lineSpacing: 8
    }).setDepth(10);

    // SJWD Logo - bottom right of play area
    const lx = hx + 50; // center x of logo
    const ly = 555;      // center y of logo
    const logoW = 100, logoH = 64;
    // Border box
    scene.add.rectangle(lx, ly, logoW, logoH, 0x000000).setStrokeStyle(2, 0xffffff, 0.6).setDepth(2);
    // Wave bar
    scene.add.rectangle(lx, ly - 20, logoW - 16, 10, 0xffffff, 0.6).setDepth(2);
    // SJWD text
    scene.add.text(lx, ly + 2, 'SJWD', {
        fontFamily: 'Arial, sans-serif', fontSize: '18px', fill: '#ffffff',
        fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(2).setAlpha(0.7);
    // WATER DISTRICT subtitle
    scene.add.text(lx, ly + 22, 'WATER DISTRICT', {
        fontFamily: 'Arial, sans-serif', fontSize: '5px', fill: '#000000',
        fontStyle: 'bold', backgroundColor: 'rgba(255,255,255,0.6)',
        padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(2).setAlpha(0.8);

    // Input
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        rotate: Phaser.Input.Keyboard.KeyCodes.W,
        drop: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    // Rotate on key press (not hold)
    scene.input.keyboard.on('keydown-UP', () => { if (gameStarted && !gameOver) rotatePiece(); });
    scene.input.keyboard.on('keydown-W', () => { if (gameStarted && !gameOver) rotatePiece(); });
    scene.input.keyboard.on('keydown-SPACE', () => { if (gameStarted && !gameOver) hardDrop(scene); });

    // Mobile buttons
    setupMobile(scene);

    // Hide HUD initially
    [scoreText, levelText, linesText, nextLabel].forEach(t => t.setVisible(false));

    buildStartScreen(scene);
    buildGameOverScreen(scene);
}

function update(time, delta) {
    if (!gameStarted || gameOver) return;
    const scene = this;

    if (!currentPiece) {
        spawnPiece(scene);
        return;
    }

    // DAS movement
    handleDAS(scene, delta);

    // Drop
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
    const leftDown = scene.cursors.left.isDown || (scene.wasd && scene.wasd.left.isDown) || scene.mobileLeftHeld;
    const rightDown = scene.cursors.right.isDown || (scene.wasd && scene.wasd.right.isDown) || scene.mobileRightHeld;

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

    // Check game over
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
    // Try normal rotation
    if (!collides(currentPiece.x, currentPiece.y, newRot)) {
        currentPiece.rot = newRot;
        sfxRotate();
        return;
    }
    // Wall kicks
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
            // Water flush animation
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

        scoreText.setText('SCORE\n' + score);
        levelText.setText('LEVEL\n' + level);
        linesText.setText('LINES\n' + lines);

        sfxClear(cleared);

        if (cleared >= 4) {
            showFloating(scene, BOARD_X + COLS * CELL / 2, BOARD_Y + ROWS * CELL / 2, 'WATER FLOW\nBONUS!', '#00ffff');
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

    // Draw placed pieces with pipe connectivity
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

        // Ghost piece
        const gy = getGhostY();
        cells.forEach(([cx, cy]) => {
            const px = BOARD_X + (currentPiece.x + cx) * CELL;
            const py = BOARD_Y + (gy + cy) * CELL;
            const conn = getCellNeighbors(cells, cx, cy);
            drawGhostPipe(ghostGraphics, px, py, currentPiece.type, conn);
        });

        // Current piece
        cells.forEach(([cx, cy]) => {
            const px = BOARD_X + (currentPiece.x + cx) * CELL;
            const py = BOARD_Y + (currentPiece.y + cy) * CELL;
            const conn = getCellNeighbors(cells, cx, cy);
            drawPipeCell(boardGraphics, px, py, currentPiece.type, 1, conn);
        });
    }

    // Next piece preview - centered in preview box
    if (nextPiece) {
        const previewCells = getCells(nextPiece, 0);
        // Calculate bounding box of the piece cells
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        previewCells.forEach(([cx, cy]) => {
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;
        });
        const pieceW = (maxX - minX + 1) * CELL;
        const pieceH = (maxY - minY + 1) * CELL;
        // Preview box center is at (380, 110)
        const boxCX = 380, boxCY = 110;
        const ox = boxCX - pieceW / 2 - minX * CELL;
        const oy = boxCY - pieceH / 2 - minY * CELL;
        previewCells.forEach(([cx, cy]) => {
            const conn = getCellNeighbors(previewCells, cx, cy);
            drawPipeCell(nextGraphics, ox + cx * CELL, oy + cy * CELL, nextPiece.type, 1, conn);
        });
    }

    // Danger zone indicator
    const topFilled = board.slice(0, 4).some(row => row.some(c => c !== null));
    if (topFilled) {
        boardGraphics.fillStyle(0xff0000, 0.05 + Math.sin(Date.now() / 300) * 0.05);
        boardGraphics.fillRect(BOARD_X, BOARD_Y, COLS * CELL, 4 * CELL);
    }
}

// --- Pipe rendering ---
const PW = 14;          // pipe outer width
const HPW = PW / 2;     // half pipe width
const WALL = 2;         // pipe wall thickness
const IW = PW - WALL*2; // inner channel width
const FW = 18;          // flange width
const HFW = FW / 2;     // half flange width
const FT = 3;           // flange thickness
const WATER_W = 4;      // water channel width

function drawPipeCell(gfx, x, y, type, alpha, conn) {
    const S = CELL;
    const cx = S / 2;   // center offset within cell
    const cy = S / 2;
    const color = COLOR_HEX[type];
    const dark = DARK[type];

    const hasL = conn.left, hasR = conn.right, hasU = conn.up, hasD = conn.down;
    const hasH = hasL || hasR;
    const hasV = hasU || hasD;

    // Draw horizontal pipe segment
    if (hasH) {
        const lx = hasL ? 0 : cx - HPW;
        const rx = hasR ? S : cx + HPW;
        const w = rx - lx;
        // Outer wall (top/bottom dark edges)
        gfx.fillStyle(dark, alpha);
        gfx.fillRect(x + lx, y + cy - HPW, w, PW);
        // Pipe body
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x + lx, y + cy - HPW + WALL, w, IW);
        // Specular highlight (top strip)
        gfx.fillStyle(0xffffff, alpha * 0.25);
        gfx.fillRect(x + lx, y + cy - HPW + WALL, w, 2);
        // Lower shadow
        gfx.fillStyle(0x000000, alpha * 0.15);
        gfx.fillRect(x + lx, y + cy + HPW - WALL - 1, w, 2);
        // Inner water channel
        gfx.fillStyle(0x00cfff, alpha * 0.35);
        gfx.fillRect(x + lx, y + cy - WATER_W / 2, w, WATER_W);

        // End cap if not connected (rounded flange end)
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

        // Flanges at connected edges
        if (hasL) {
            gfx.fillStyle(dark, alpha * 0.9);
            gfx.fillRect(x, y + cy - HFW, FT, FW);
            gfx.fillStyle(color, alpha * 0.6);
            gfx.fillRect(x + 1, y + cy - HFW + 1, FT - 1, FW - 2);
            // Bolts
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

    // Draw vertical pipe segment
    if (hasV) {
        const ty = hasU ? 0 : cy - HPW;
        const by = hasD ? S : cy + HPW;
        const h = by - ty;
        // Outer wall
        gfx.fillStyle(dark, alpha);
        gfx.fillRect(x + cx - HPW, y + ty, PW, h);
        // Pipe body
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x + cx - HPW + WALL, y + ty, IW, h);
        // Specular highlight (left strip)
        gfx.fillStyle(0xffffff, alpha * 0.25);
        gfx.fillRect(x + cx - HPW + WALL, y + ty, 2, h);
        // Right shadow
        gfx.fillStyle(0x000000, alpha * 0.15);
        gfx.fillRect(x + cx + HPW - WALL - 1, y + ty, 2, h);
        // Water channel
        gfx.fillStyle(0x00cfff, alpha * 0.35);
        gfx.fillRect(x + cx - WATER_W / 2, y + ty, WATER_W, h);

        // End caps
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

        // Flanges at connected edges
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

    // Junction hub where horizontal and vertical meet
    if (hasH && hasV) {
        // Dark ring
        gfx.fillStyle(dark, alpha);
        gfx.fillRect(x + cx - HPW - 1, y + cy - HPW - 1, PW + 2, PW + 2);
        // Colored hub
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x + cx - HPW + 1, y + cy - HPW + 1, PW - 2, PW - 2);
        // Center rivet
        gfx.fillStyle(0xcccccc, alpha * 0.6);
        gfx.fillCircle(x + cx, y + cy, 2.5);
        gfx.fillStyle(0xffffff, alpha * 0.3);
        gfx.fillCircle(x + cx - 0.5, y + cy - 0.5, 1);
    }

    // Isolated cell (shouldn't happen normally, but fallback)
    if (!hasH && !hasV) {
        gfx.fillStyle(dark, alpha);
        gfx.fillRoundedRect(x + 3, y + 3, S - 6, S - 6, 4);
        gfx.fillStyle(color, alpha);
        gfx.fillRoundedRect(x + 5, y + 5, S - 10, S - 10, 3);
        gfx.fillStyle(0xffffff, alpha * 0.2);
        gfx.fillRoundedRect(x + 6, y + 6, S - 12, 3, 1);
        gfx.fillStyle(0xcccccc, alpha * 0.5);
        gfx.fillCircle(x + cx, y + cy, 2.5);
    }
}

// Ghost pipe - outline version showing pipe connectivity
function drawGhostPipe(gfx, x, y, type, conn) {
    const S = CELL;
    const cx = S / 2;
    const cy = S / 2;
    const color = COLOR_HEX[type];
    const a = 0.25;

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
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '12px', fill: color, align: 'center'
    }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 1000, onComplete: () => txt.destroy() });
}

function endGame(scene) {
    gameOver = true;
    sfxGameOver();
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

function setupMobile(scene) {
    scene.mobileLeftHeld = false;
    scene.mobileRightHeld = false;

    const btnL = document.getElementById('btn-left');
    const btnR = document.getElementById('btn-right');
    const btnRot = document.getElementById('btn-rotate');
    const btnD = document.getElementById('btn-down');
    const btnDrop = document.getElementById('btn-drop');

    if (btnL) {
        btnL.addEventListener('touchstart', (e) => { e.preventDefault(); scene.mobileLeftHeld = true; });
        btnL.addEventListener('touchend', () => { scene.mobileLeftHeld = false; });
        btnL.addEventListener('mousedown', () => { scene.mobileLeftHeld = true; });
        btnL.addEventListener('mouseup', () => { scene.mobileLeftHeld = false; });
    }
    if (btnR) {
        btnR.addEventListener('touchstart', (e) => { e.preventDefault(); scene.mobileRightHeld = true; });
        btnR.addEventListener('touchend', () => { scene.mobileRightHeld = false; });
        btnR.addEventListener('mousedown', () => { scene.mobileRightHeld = true; });
        btnR.addEventListener('mouseup', () => { scene.mobileRightHeld = false; });
    }
    if (btnRot) {
        btnRot.addEventListener('touchstart', (e) => { e.preventDefault(); rotatePiece(); });
        btnRot.addEventListener('click', () => { rotatePiece(); });
    }
    if (btnD) {
        btnD.addEventListener('touchstart', (e) => { e.preventDefault(); if (currentPiece) movePiece(0, 1); });
        btnD.addEventListener('click', () => { if (currentPiece) movePiece(0, 1); });
    }
    if (btnDrop) {
        btnDrop.addEventListener('touchstart', (e) => { e.preventDefault(); hardDrop(scene); });
        btnDrop.addEventListener('click', () => { hardDrop(scene); });
    }
}

// UI Screens
function buildStartScreen(scene) {
    startGroup = scene.add.group();
    const bg = scene.add.rectangle(240, 320, 480, 640, 0x000000, 0.9).setDepth(50);
    startGroup.add(bg);

    // SJWD Logo
    startGroup.add(scene.add.rectangle(240, 90, 140, 90, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51));
    startGroup.add(scene.add.rectangle(240, 65, 120, 16, 0xffffff).setDepth(51));
    startGroup.add(scene.add.text(240, 88, 'SJWD', { fontFamily: 'Arial', fontSize: '24px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 118, 'WATER DISTRICT', { fontFamily: 'Arial', fontSize: '8px', fill: '#000', backgroundColor: '#fff', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 185, 'PIPE FITTER', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '24px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 215, 'Build the Pipeline!', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '10px', fill: '#fff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 270, 'Fit pipe segments\ntogether to build\ncomplete pipelines!\n\nClear rows to flush\nwater through!', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '9px', fill: '#aaa', align: 'center', lineSpacing: 6
    }).setOrigin(0.5).setDepth(51));

    // Show pipe piece icons using graphics
    const legendGfx = scene.add.graphics().setDepth(51);
    startGroup.add(legendGfx);
    const pcs = [
        { n: 'Straight', c: COLORS.I, hex: COLOR_HEX.I, dk: DARK.I },
        { n: 'Elbow', c: COLORS.L, hex: COLOR_HEX.L, dk: DARK.L },
        { n: 'T-Joint', c: COLORS.T, hex: COLOR_HEX.T, dk: DARK.T },
        { n: 'Valve', c: COLORS.O, hex: COLOR_HEX.O, dk: DARK.O }
    ];
    pcs.forEach((p, i) => {
        const lx = 80 + i * 107;
        // Mini pipe icons
        if (i === 0) { // Straight: horizontal bar
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 16, 377, 32, 10);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 16, 379, 32, 6);
            legendGfx.fillStyle(0xffffff, 0.25); legendGfx.fillRect(lx - 16, 379, 32, 2);
        } else if (i === 1) { // Elbow: L-shape
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 5, 370, 10, 18);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 3, 370, 6, 18);
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 5, 380, 20, 10);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 5, 382, 20, 6);
        } else if (i === 2) { // T-junction
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 16, 374, 32, 10);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 16, 376, 32, 6);
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRect(lx - 5, 378, 10, 14);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRect(lx - 3, 378, 6, 14);
        } else { // Valve: square block
            legendGfx.fillStyle(p.dk, 1); legendGfx.fillRoundedRect(lx - 10, 372, 20, 20, 3);
            legendGfx.fillStyle(p.hex, 1); legendGfx.fillRoundedRect(lx - 8, 374, 16, 16, 2);
            legendGfx.fillStyle(0xcccccc, 0.5); legendGfx.fillCircle(lx, 382, 3);
        }
        startGroup.add(scene.add.text(lx, 396, p.n, { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '6px', fill: p.c }).setOrigin(0.5, 0).setDepth(51));
    });

    startGroup.add(scene.add.text(240, 430, 'Arrows/WASD + Space', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '9px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));

    const btnBg = scene.add.rectangle(240, 500, 220, 50, 0x4a5568).setStrokeStyle(3, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    startGroup.add(btnBg);
    const btnTxt = scene.add.text(240, 500, 'START FITTING', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '12px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51);
    startGroup.add(btnTxt);

    btnBg.on('pointerover', () => { btnBg.setFillStyle(0x718096); btnTxt.setFill('#fff'); });
    btnBg.on('pointerout', () => { btnBg.setFillStyle(0x4a5568); btnTxt.setFill('#00bfff'); });
    btnBg.on('pointerdown', () => startPlay(scene));
    scene.input.keyboard.on('keydown-ENTER', () => { if (!gameStarted) startPlay(scene); });
}

function buildGameOverScreen(scene) {
    // Game over UI is dynamically built by showGameOverScreen()
    scene.input.keyboard.on('keydown-ENTER', () => { if (gameOver) restartPlay(scene); });
    scene.input.keyboard.on('keydown-SPACE', () => { if (gameOver) restartPlay(scene); });
}

function startPlay(scene) {
    initAudio();
    gameStarted = true;
    startGroup.getChildren().forEach(c => c.setVisible(false));
    [scoreText, levelText, linesText, nextLabel].forEach(t => t.setVisible(true));
    spawnPiece(scene);
}

function restartPlay(scene) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    score = 0; level = 1; lines = 0;
    gameOver = false;
    dropInterval = 800;
    dropTime = 0; lockDelay = 0;
    currentPiece = null; nextPiece = null;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            board[r][c] = null;
        }
    }

    scoreText.setText('SCORE\n0');
    levelText.setText('LEVEL\n1');
    linesText.setText('LINES\n0');

    boardGraphics.clear();
    ghostGraphics.clear();
    nextGraphics.clear();

    spawnPiece(scene);
}
