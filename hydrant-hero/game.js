// Hydrant Hero - SJWD Water District
// Whack-a-Mole style arcade game

const config = {
    type: Phaser.AUTO,
    width: 480,
    height: 640,
    parent: 'game-container',
    backgroundColor: '#0a1628',
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

const FONT = "'Press Start 2P', 'Courier New', monospace";
const GAME_ID = 'hydrant-hero';

const GRID_COLS = 3, GRID_ROWS = 3;
const CELL_SIZE = 110;
const GRID_X = 240 - (GRID_COLS * CELL_SIZE) / 2 + CELL_SIZE / 2;
const GRID_Y = 220;

let stations = [];
let score = 0, combo = 0, comboTimer = 0, maxCombo = 0;
let pressure = 100;
let scoreText, comboText, pressureBar, pressureBg, pressureLabel;
let gameOver = false, gameStarted = false;
let startGroup;
let lbGroup = null;
let leakTimer = 0, difficulty = 1;
let elapsed = 0;
let burstMainTimer = 0, burstMainActive = false;

// --- Audio (Web Audio API) ---
let audioCtx = null;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function sfxFix() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [523, 784].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.06);
        g.gain.setValueAtTime(0.10, t + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
        o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.12);
    });
}
function sfxCombo(mult) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const freqs = [523, 659, 784, 1047];
    const n = Math.min(mult, freqs.length);
    for (let i = 0; i < n; i++) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freqs[i], t + i * 0.08);
        g.gain.setValueAtTime(0.10, t + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.14);
        o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.14);
    }
}
function sfxMissLeak() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.24);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.start(t); osc.stop(t + 0.24);
}
function sfxBurstMain() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [300, 250, 200, 150].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(f, t + i * 0.09);
        g.gain.setValueAtTime(0.12, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.18);
    });
}
function sfxGameOver() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [440, 370, 330, 277, 220].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t + i * 0.13);
        g.gain.setValueAtTime(0.10, t + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.20);
        o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.20);
    });
}

// --- Leaderboard ---
function lbKey() { return 'sjwd_' + GAME_ID + '_' + new Date().toISOString().slice(0, 10); }
function getLB() { try { return JSON.parse(localStorage.getItem(lbKey()) || '[]'); } catch(e) { return []; } }
function saveLB(e) { localStorage.setItem(lbKey(), JSON.stringify(e)); }
function isTopScore(s) { const lb = getLB(); return s > 0 && (lb.length < 5 || s > lb[lb.length - 1].score); }
function addLBEntry(name, s) {
    const lb = getLB(), ts = Date.now();
    lb.push({ name: name.slice(0, 12).toUpperCase(), score: s, ts });
    lb.sort((a, b) => b.score - a.score || a.ts - b.ts);
    const top5 = lb.slice(0, 5);
    saveLB(top5);
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
    lbGroup.add(scene.add.text(CW/2, 82, 'PRESSURE LOST!', {
        fontFamily: FONT, fontSize: '22px', fill: '#ff4444',
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

    const gridBg = scene.add.rectangle(240, GRID_Y + CELL_SIZE, GRID_COLS * CELL_SIZE + 20, GRID_ROWS * CELL_SIZE + 20, 0x1a2a3a, 0.5);
    gridBg.setStrokeStyle(2, 0x2a4a6a);

    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const x = GRID_X + c * CELL_SIZE;
            const y = GRID_Y + r * CELL_SIZE;
            const station = createStation(scene, x, y, r * GRID_COLS + c);
            stations.push(station);
        }
    }

    // HUD
    scoreText = scene.add.text(16, 16, 'SCORE: 0', {
        fontFamily: FONT, fontSize: '12px', fill: '#00bfff'
    }).setDepth(10);

    comboText = scene.add.text(240, 16, '', {
        fontFamily: FONT, fontSize: '12px', fill: '#ffff00'
    }).setOrigin(0.5, 0).setDepth(10);

    pressureLabel = scene.add.text(440, 100, 'PSI', {
        fontFamily: FONT, fontSize: '8px', fill: '#aaa'
    }).setOrigin(0.5).setDepth(10);
    pressureBg = scene.add.rectangle(440, 320, 30, 400, 0x1a1a2e).setStrokeStyle(2, 0x4a5568).setDepth(10);
    pressureBar = scene.add.rectangle(440, 520, 24, 0, 0x00bfff).setOrigin(0.5, 1).setDepth(10);

    updatePressureBar();

    [scoreText, comboText, pressureLabel, pressureBg, pressureBar].forEach(h => h.setVisible(false));
    stations.forEach(s => s.container.setVisible(false));
    gridBg.setVisible(false);

    buildStartScreen(scene);
    buildGameOverScreen(scene);

    scene.gridBg = gridBg;

    scene.input.on('pointerdown', () => initAudio());
}

function update(time, delta) {
    if (!gameStarted || gameOver) return;
    const scene = this;

    elapsed += delta;
    difficulty = 1 + Math.floor(elapsed / 15000) * 0.3;

    if (combo > 0) {
        comboTimer -= delta;
        if (comboTimer <= 0) {
            combo = 0;
            comboText.setText('');
        }
    }

    leakTimer += delta;
    const leakInterval = Math.max(400, 1500 - difficulty * 100);
    if (leakTimer > leakInterval) {
        leakTimer = 0;
        spawnLeak(scene);
    }

    burstMainTimer += delta;
    if (burstMainTimer > 60000 && !burstMainActive) {
        burstMainActive = true;
        burstMainTimer = 0;
        triggerBurstMain(scene);
    }

    stations.forEach(s => {
        if (s.leaking) {
            s.leakTime -= delta;
            const pct = Math.max(0, s.leakTime / s.leakDuration);
            s.timerBar.scaleX = pct;
            s.timerBar.setFillStyle(pct > 0.5 ? 0x00ff00 : pct > 0.25 ? 0xffff00 : 0xff0000);

            if (s.sprayParticles.length > 0) {
                s.sprayParticles.forEach(p => {
                    p.y -= 0.5;
                    p.alpha = 0.5 + Math.sin(time / 200 + p.x) * 0.3;
                });
            }

            if (s.leakTime <= 0) {
                missLeak(scene, s);
            }
        }
    });

    if (pressure < 100) {
        pressure = Math.min(100, pressure + 0.5 * delta / 1000);
        updatePressureBar();
    }

    if (pressure <= 0) {
        endGame(scene);
    }
}

function createStation(scene, x, y, index) {
    const container = scene.add.container(x, y).setDepth(5);

    const base = scene.add.rectangle(0, 20, 50, 12, 0x555555);
    const body = scene.add.rectangle(0, 0, 30, 44, 0xcc2222);
    const bodyHighlight = scene.add.rectangle(-4, -4, 10, 30, 0xff4444, 0.4);
    const cap = scene.add.rectangle(0, -24, 36, 8, 0x999999);
    const capTop = scene.add.circle(0, -30, 6, 0xaaaaaa);
    const leftOut = scene.add.rectangle(-20, 2, 14, 10, 0xcc2222);
    const rightOut = scene.add.rectangle(20, 2, 14, 10, 0xcc2222);
    const leftCap = scene.add.circle(-28, 2, 5, 0x999999);
    const rightCap = scene.add.circle(28, 2, 5, 0x999999);

    container.add([base, body, bodyHighlight, cap, capTop, leftOut, rightOut, leftCap, rightCap]);

    const timerBg = scene.add.rectangle(0, 36, 60, 6, 0x333333);
    const timerBar = scene.add.rectangle(-30, 36, 60, 6, 0x00ff00).setOrigin(0, 0.5);
    container.add([timerBg, timerBar]);
    timerBar.setVisible(false);
    timerBg.setVisible(false);

    const hitZone = scene.add.rectangle(0, 0, CELL_SIZE - 10, CELL_SIZE - 10, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerdown', () => {
        if (!gameStarted || gameOver) return;
        if (station.leaking) {
            fixLeak(scene, station);
        }
    });

    const station = {
        container, body, cap, capTop, leftOut, rightOut, leftCap, rightCap,
        timerBar, timerBg, hitZone, base, bodyHighlight,
        x, y, index,
        leaking: false, leakType: 0, leakTime: 0, leakDuration: 0,
        sprayParticles: []
    };
    return station;
}

function spawnLeak(scene) {
    const available = stations.filter(s => !s.leaking);
    if (available.length === 0) return;

    const station = Phaser.Utils.Array.GetRandom(available);
    let leakType;
    if (difficulty < 2) leakType = Phaser.Math.Between(0, 1);
    else if (difficulty < 3) leakType = Phaser.Math.Between(0, 2);
    else leakType = Phaser.Math.Between(0, 3);

    activateLeak(scene, station, leakType);
}

function activateLeak(scene, station, leakType) {
    const durations = [3000, 2000, 1500, 1000];
    const dur = durations[leakType] / Math.max(1, difficulty * 0.5);

    station.leaking = true;
    station.leakType = leakType;
    station.leakDuration = dur;
    station.leakTime = dur;

    station.timerBar.setVisible(true);
    station.timerBg.setVisible(true);
    station.timerBar.scaleX = 1;

    const colors = [0x2288cc, 0x22aacc, 0xcc6622, 0xff2222];
    station.body.setFillStyle(colors[leakType]);

    clearSpray(station);
    const sprayCount = 2 + leakType * 2;
    for (let i = 0; i < sprayCount; i++) {
        const px = station.x + Phaser.Math.Between(-25, 25);
        const py = station.y + Phaser.Math.Between(-35, -15);
        const size = 2 + leakType;
        const sprayColors = [0x66bbff, 0x44aaff, 0x2299ff, 0x0088ff];
        const dot = scene.add.circle(px, py, size, sprayColors[leakType], 0.7).setDepth(6);
        station.sprayParticles.push(dot);

        scene.tweens.add({
            targets: dot,
            y: py - Phaser.Math.Between(10, 30 + leakType * 10),
            x: px + Phaser.Math.Between(-15, 15),
            duration: 500 + leakType * 200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    if (leakType >= 2) {
        scene.tweens.add({
            targets: station.container,
            scaleX: 1.05, scaleY: 1.05,
            duration: 200,
            yoyo: true,
            repeat: -1,
            key: 'pulse_' + station.index
        });
    }
}

function fixLeak(scene, station) {
    if (!station.leaking) return;

    const points = [10, 25, 50, 100];
    const basePoints = points[station.leakType];

    combo++;
    comboTimer = 2000;
    if (combo > maxCombo) maxCombo = combo;

    const multiplier = Math.min(4, Math.floor(combo / 3) + 1);
    const earned = basePoints * multiplier;
    score += earned;
    scoreText.setText('SCORE: ' + score);

    if (multiplier > 1) {
        sfxCombo(multiplier);
        comboText.setText('x' + multiplier + ' COMBO');
        showFloating(scene, station.x, station.y - 50, 'x' + multiplier, '#ffff00');
    } else {
        sfxFix();
    }

    showFloating(scene, station.x, station.y - 30, '+' + earned, '#00ff7f');

    const wrench = scene.add.text(station.x, station.y, '🔧', { fontSize: '24px' }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({
        targets: wrench, scale: 1.5, alpha: 0, y: station.y - 40,
        duration: 500, onComplete: () => wrench.destroy()
    });

    pressure = Math.min(100, pressure + 2 + station.leakType);
    updatePressureBar();

    deactivateLeak(scene, station);

    const flash = scene.add.circle(station.x, station.y, 40, 0x00ff00, 0.3).setDepth(7);
    scene.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 300, onComplete: () => flash.destroy() });
}

function missLeak(scene, station) {
    const pressureLoss = [5, 10, 15, 20];
    pressure -= pressureLoss[station.leakType];
    if (pressure < 0) pressure = 0;
    updatePressureBar();

    combo = 0;
    comboText.setText('');
    sfxMissLeak();

    const flash = scene.add.circle(station.x, station.y, 40, 0xff0000, 0.4).setDepth(7);
    scene.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 400, onComplete: () => flash.destroy() });
    showFloating(scene, station.x, station.y - 30, 'MISSED!', '#ff4444');

    deactivateLeak(scene, station);
}

function deactivateLeak(scene, station) {
    station.leaking = false;
    station.leakType = 0;
    station.timerBar.setVisible(false);
    station.timerBg.setVisible(false);
    station.body.setFillStyle(0xcc2222);
    station.container.setScale(1);
    scene.tweens.killTweensOf(station.container);
    clearSpray(station);
}

function clearSpray(station) {
    station.sprayParticles.forEach(p => {
        if (p.scene) p.scene.tweens.killTweensOf(p);
        p.destroy();
    });
    station.sprayParticles = [];
}

function triggerBurstMain(scene) {
    sfxBurstMain();
    showFloating(scene, 240, 160, 'BURST MAIN!', '#ff0000');
    const flash = scene.add.rectangle(240, 320, 480, 640, 0xff0000, 0.15).setDepth(4);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 1000, onComplete: () => flash.destroy() });

    stations.forEach(s => {
        if (!s.leaking) {
            activateLeak(scene, s, Phaser.Math.Between(1, 3));
        }
    });

    scene.time.delayedCall(5000, () => { burstMainActive = false; });
}

function updatePressureBar() {
    const h = (pressure / 100) * 396;
    pressureBar.height = h;
    if (pressure > 60) pressureBar.setFillStyle(0x00bfff);
    else if (pressure > 30) pressureBar.setFillStyle(0xffff00);
    else pressureBar.setFillStyle(0xff0000);
}

function showFloating(scene, x, y, msg, color) {
    const txt = scene.add.text(x, y, msg, {
        fontFamily: FONT, fontSize: '12px', fill: color
    }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, onComplete: () => txt.destroy() });
}

function endGame(scene) {
    gameOver = true;
    stations.forEach(s => { deactivateLeak(scene, s); });
    sfxGameOver();
    const subtitleLines = ['SCORE: ' + score, 'BEST COMBO: x' + maxCombo];
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
    const bg = scene.add.rectangle(240, 320, 480, 640, 0x000000, 0.9).setDepth(50);
    startGroup.add(bg);

    startGroup.add(scene.add.rectangle(240, 100, 140, 90, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51));
    startGroup.add(scene.add.rectangle(240, 75, 120, 16, 0xffffff).setDepth(51));
    startGroup.add(scene.add.text(240, 98, 'SJWD', { fontFamily: 'Arial', fontSize: '24px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 128, 'WATER DISTRICT', { fontFamily: 'Arial', fontSize: '8px', fill: '#000', backgroundColor: '#fff', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 195, 'HYDRANT HERO', { fontFamily: FONT, fontSize: '22px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 225, 'Stop the Leaks!', { fontFamily: FONT, fontSize: '10px', fill: '#fff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 280, 'Tap leaking hydrants\nto fix them before\nthe pressure drops!\n\nBuild combos for\nbig points!', {
        fontFamily: FONT, fontSize: '9px', fill: '#aaa', align: 'center', lineSpacing: 6
    }).setOrigin(0.5).setDepth(51));

    const legend = [
        { n: 'Drip', c: '#2288cc', p: '10' },
        { n: 'Spray', c: '#22aacc', p: '25' },
        { n: 'Burst', c: '#cc6622', p: '50' },
        { n: 'Blowout', c: '#ff2222', p: '100' }
    ];
    legend.forEach((it, i) => {
        const lx = 80 + i * 107;
        startGroup.add(scene.add.circle(lx, 395, 6, Phaser.Display.Color.HexStringToColor(it.c).color).setDepth(51));
        startGroup.add(scene.add.text(lx, 408, it.n, { fontFamily: FONT, fontSize: '6px', fill: it.c }).setOrigin(0.5, 0).setDepth(51));
        startGroup.add(scene.add.text(lx, 420, it.p + 'pts', { fontFamily: FONT, fontSize: '6px', fill: '#888' }).setOrigin(0.5, 0).setDepth(51));
    });

    startGroup.add(scene.add.text(240, 455, 'Tap / Click to Fix', { fontFamily: FONT, fontSize: '9px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));

    const btnBg = scene.add.rectangle(240, 520, 220, 50, 0x4a5568).setStrokeStyle(3, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    startGroup.add(btnBg);
    const btnTxt = scene.add.text(240, 520, 'START FIXING', { fontFamily: FONT, fontSize: '12px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51);
    startGroup.add(btnTxt);

    btnBg.on('pointerover', () => { btnBg.setFillStyle(0x718096); btnTxt.setFill('#fff'); });
    btnBg.on('pointerout', () => { btnBg.setFillStyle(0x4a5568); btnTxt.setFill('#00bfff'); });
    btnBg.on('pointerdown', () => startPlay(scene));
    scene.input.keyboard.on('keydown-ENTER', () => { if (!gameStarted) startPlay(scene); });
    scene.input.keyboard.on('keydown-SPACE', () => { if (!gameStarted) startPlay(scene); });
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
    [scoreText, comboText, pressureLabel, pressureBg, pressureBar].forEach(h => h.setVisible(true));
    stations.forEach(s => s.container.setVisible(true));
    if (scene.gridBg) scene.gridBg.setVisible(true);
}

function restartPlay(scene) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    score = 0; combo = 0; maxCombo = 0; pressure = 100;
    gameOver = false; elapsed = 0; difficulty = 1;
    leakTimer = 0; burstMainTimer = 0; burstMainActive = false;
    comboTimer = 0;

    scoreText.setText('SCORE: 0');
    comboText.setText('');
    updatePressureBar();

    stations.forEach(s => deactivateLeak(scene, s));
}
