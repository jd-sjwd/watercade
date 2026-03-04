// Drop Catcher - SJWD Water District
// Kaboom/Catch-style arcade game

const config = {
    type: Phaser.AUTO,
    width: 480,
    height: 640,
    parent: 'game-container',
    backgroundColor: '#0a1628',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

const FONT = "'Press Start 2P', 'Courier New', monospace";
const GAME_ID = 'drop-catcher';

let bucket, cursors, drops, contaminants, powerUps;
let score = 0, lives = 3, level = 1, missed = 0;
let scoreText, livesText, levelText, missedText;
let gameOver = false, gameStarted = false;
let filterActive = false, speedActive = false;
let filterTimer = 0, speedTimer = 0;
let filterIndicator, speedIndicator;
let dropTimer = 0, contaminantTimer = 0, powerUpTimer = 0;
let startGroup;
let lbGroup = null;
let bucketSpeed = 300;
let pointerDown = false;

// --- Audio (Web Audio API) ---
let audioCtx = null;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function sfxCatch() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    osc.start(t); osc.stop(t + 0.10);
}
function sfxContaminant() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t); osc.stop(t + 0.25);
}
function sfxPowerUp() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.07);
        g.gain.setValueAtTime(0.10, t + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.15);
        o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.15);
    });
}
function sfxMiss() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.22);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.start(t); osc.stop(t + 0.22);
}
function sfxLevelUp() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [523, 659, 784, 1047, 1568].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.09);
        g.gain.setValueAtTime(0.10, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.15);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.15);
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
    lbGroup.add(scene.add.text(CW/2, 82, 'GAME OVER', {
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
    rBg.on('pointerdown', () => restartGamePlay(scene));
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

    // Create textures
    createBucketTexture(scene);
    createDropTexture(scene);
    createContaminantTextures(scene);
    createPowerUpTextures(scene);
    createLifeTexture(scene);

    // Groups
    drops = scene.physics.add.group();
    contaminants = scene.physics.add.group();
    powerUps = scene.physics.add.group();

    // Bucket
    bucket = scene.physics.add.sprite(240, 580, 'bucket');
    bucket.setCollideWorldBounds(true);
    bucket.body.setSize(72, 40);
    bucket.setImmovable(true);
    bucket.setVisible(false);

    // HUD
    scoreText = scene.add.text(16, 16, 'SCORE: 0', {
        fontFamily: FONT, fontSize: '12px', fill: '#00bfff'
    }).setDepth(10).setVisible(false);

    levelText = scene.add.text(240, 16, 'LEVEL 1', {
        fontFamily: FONT, fontSize: '12px', fill: '#ffff00'
    }).setOrigin(0.5, 0).setDepth(10).setVisible(false);

    livesText = scene.add.text(464, 16, '', {
        fontFamily: FONT, fontSize: '12px', fill: '#ff6b6b'
    }).setOrigin(1, 0).setDepth(10).setVisible(false);

    missedText = scene.add.text(240, 36, '', {
        fontFamily: FONT, fontSize: '8px', fill: '#ff9999'
    }).setOrigin(0.5, 0).setDepth(10).setVisible(false);

    filterIndicator = scene.add.text(16, 56, 'FILTER ON', {
        fontFamily: FONT, fontSize: '8px', fill: '#00ffff'
    }).setDepth(10).setVisible(false);

    speedIndicator = scene.add.text(16, 72, 'SPEED UP', {
        fontFamily: FONT, fontSize: '8px', fill: '#ffff00'
    }).setDepth(10).setVisible(false);

    // Collisions
    scene.physics.add.overlap(bucket, drops, catchDrop, null, scene);
    scene.physics.add.overlap(bucket, contaminants, catchContaminant, null, scene);
    scene.physics.add.overlap(bucket, powerUps, catchPowerUp, null, scene);

    // Input
    cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // Touch/mouse
    scene.input.on('pointermove', (pointer) => {
        if (gameStarted && !gameOver && pointer.isDown) {
            bucket.x = Phaser.Math.Clamp(pointer.x, 40, 440);
        }
    });
    scene.input.on('pointerdown', (pointer) => {
        initAudio();
        if (gameStarted && !gameOver) {
            bucket.x = Phaser.Math.Clamp(pointer.x, 40, 440);
        }
    });

    // Build start screen
    buildStartScreen(scene);
    buildGameOverScreen(scene);

    updateLivesDisplay();
}

function update(time, delta) {
    if (!gameStarted || gameOver) return;

    const scene = this;

    // Keyboard movement
    bucket.setVelocityX(0);
    const spd = speedActive ? bucketSpeed * 1.6 : bucketSpeed;
    if (cursors.left.isDown || scene.wasd.left.isDown) {
        bucket.setVelocityX(-spd);
    } else if (cursors.right.isDown || scene.wasd.right.isDown) {
        bucket.setVelocityX(spd);
    }

    // Spawn drops
    dropTimer += delta;
    const dropInterval = Math.max(300, 800 - level * 50);
    if (dropTimer > dropInterval) {
        dropTimer = 0;
        spawnDrop(scene);
    }

    // Spawn contaminants
    contaminantTimer += delta;
    const contInterval = Math.max(800, 2000 - level * 100);
    if (contaminantTimer > contInterval) {
        contaminantTimer = 0;
        spawnContaminant(scene);
    }

    // Spawn power-ups
    powerUpTimer += delta;
    if (powerUpTimer > 8000) {
        powerUpTimer = 0;
        if (Phaser.Math.Between(0, 100) < 30) {
            spawnPowerUp(scene);
        }
    }

    // Power-up timers
    if (filterActive) {
        filterTimer -= delta;
        if (filterTimer <= 0) {
            filterActive = false;
            filterIndicator.setVisible(false);
            bucket.setTint(0xffffff);
        }
    }
    if (speedActive) {
        speedTimer -= delta;
        if (speedTimer <= 0) {
            speedActive = false;
            speedIndicator.setVisible(false);
        }
    }

    // Check for objects that fell off screen
    drops.getChildren().forEach(d => {
        if (d.y > 660) {
            d.destroy();
            missed++;
            updateMissedDisplay();
            if (missed >= 10) {
                missed = 0;
                loseLife(scene);
            }
        }
    });
    contaminants.getChildren().forEach(c => {
        if (c.y > 660) c.destroy();
    });
    powerUps.getChildren().forEach(p => {
        if (p.y > 660) p.destroy();
    });

    // Level check
    const newLevel = Math.floor(score / 500) + 1;
    if (newLevel > level) {
        level = newLevel;
        levelText.setText('LEVEL ' + level);
        sfxLevelUp();
        showFloatingText(scene, 240, 300, 'LEVEL UP!', '#ffff00');
    }
}

function spawnDrop(scene) {
    const x = Phaser.Math.Between(30, 450);
    const drop = scene.physics.add.sprite(x, -20, 'waterdrop');
    drops.add(drop);
    const speed = 120 + level * 20;
    drop.setVelocityY(Phaser.Math.Between(speed, speed + 60));
    drop.body.setSize(16, 20);
}

function spawnContaminant(scene) {
    const x = Phaser.Math.Between(30, 450);
    let type;
    if (level >= 4) type = Phaser.Math.Between(0, 3);
    else if (level >= 3) type = Phaser.Math.Between(0, 2);
    else if (level >= 2) type = Phaser.Math.Between(0, 1);
    else type = 0;

    const keys = ['bacteria', 'lead', 'rust', 'sewage'];
    const c = scene.physics.add.sprite(x, -20, keys[type]);
    contaminants.add(c);
    c.setData('type', keys[type]);
    const speed = 100 + level * 15;
    c.setVelocityY(Phaser.Math.Between(speed, speed + 40));
    c.body.setSize(20, 20);
}

function spawnPowerUp(scene) {
    const x = Phaser.Math.Between(30, 450);
    const type = Phaser.Math.Between(0, 1);
    const key = type === 0 ? 'filter' : 'speedboost';
    const p = scene.physics.add.sprite(x, -20, key);
    powerUps.add(p);
    p.setData('type', key);
    p.setVelocityY(100);
    p.body.setSize(20, 20);
}

function catchDrop(bkt, drop) {
    sfxCatch();
    score += 10;
    scoreText.setText('SCORE: ' + score);
    splashEffect(drop.scene, drop.x, drop.y, 0x00bfff);
    drop.destroy();
}

function catchContaminant(bkt, cont) {
    const scene = cont.scene;
    if (filterActive) {
        sfxCatch();
        score += 25;
        scoreText.setText('SCORE: ' + score);
        splashEffect(scene, cont.x, cont.y, 0x00ffff);
        showFloatingText(scene, cont.x, cont.y, '+25', '#00ffff');
        cont.destroy();
        return;
    }
    sfxContaminant();
    cont.destroy();
    redFlash(scene);
    loseLife(scene);
}

function catchPowerUp(bkt, pu) {
    const scene = pu.scene;
    const type = pu.getData('type');
    sfxPowerUp();
    if (type === 'filter') {
        filterActive = true;
        filterTimer = 5000;
        filterIndicator.setVisible(true);
        bucket.setTint(0x00ffff);
        showFloatingText(scene, pu.x, pu.y, 'FILTER!', '#00ffff');
    } else {
        speedActive = true;
        speedTimer = 5000;
        speedIndicator.setVisible(true);
        showFloatingText(scene, pu.x, pu.y, 'SPEED!', '#ffff00');
    }
    splashEffect(scene, pu.x, pu.y, 0xffff00);
    pu.destroy();
}

function loseLife(scene) {
    lives--;
    updateLivesDisplay();
    if (lives <= 0) {
        endGame(scene);
    } else {
        sfxMiss();
    }
}

function endGame(scene) {
    gameOver = true;
    bucket.setVisible(false);
    drops.clear(true, true);
    contaminants.clear(true, true);
    powerUps.clear(true, true);
    sfxGameOver();
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
}

function updateLivesDisplay() {
    let txt = '';
    for (let i = 0; i < lives; i++) txt += '♥ ';
    if (livesText) livesText.setText(txt.trim());
}

function updateMissedDisplay() {
    if (missedText) {
        missedText.setText('MISSED: ' + missed + '/10');
        missedText.setVisible(gameStarted && !gameOver);
    }
}

function splashEffect(scene, x, y, color) {
    for (let i = 0; i < 6; i++) {
        const p = scene.add.circle(x, y, 3, color);
        scene.tweens.add({
            targets: p,
            x: x + Phaser.Math.Between(-30, 30),
            y: y + Phaser.Math.Between(-30, 10),
            alpha: 0,
            scale: 0.2,
            duration: 400,
            onComplete: () => p.destroy()
        });
    }
}

function redFlash(scene) {
    const flash = scene.add.rectangle(240, 320, 480, 640, 0xff0000, 0.3).setDepth(5);
    scene.tweens.add({
        targets: flash, alpha: 0, duration: 300,
        onComplete: () => flash.destroy()
    });
}

function showFloatingText(scene, x, y, msg, color) {
    const txt = scene.add.text(x, y, msg, {
        fontFamily: FONT, fontSize: '14px', fill: color
    }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({
        targets: txt, y: y - 50, alpha: 0, duration: 800,
        onComplete: () => txt.destroy()
    });
}

// Texture creation
function createBucketTexture(scene) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x2196f3);
    g.fillRoundedRect(4, 10, 72, 40, 4);
    g.fillStyle(0x64b5f6);
    g.fillRoundedRect(0, 6, 80, 8, 3);
    g.lineStyle(3, 0x90caf9);
    g.strokeEllipse(40, 4, 30, 10);
    g.fillStyle(0x42a5f5, 0.5);
    g.fillRoundedRect(10, 16, 60, 8, 2);
    g.generateTexture('bucket', 80, 52);
    g.destroy();
}

function createDropTexture(scene) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x00bfff);
    g.fillCircle(10, 14, 8);
    g.fillTriangle(10, 2, 4, 12, 16, 12);
    g.fillStyle(0x80dfff, 0.6);
    g.fillCircle(8, 12, 3);
    g.generateTexture('waterdrop', 20, 24);
    g.destroy();
}

function createContaminantTextures(scene) {
    let g = scene.make.graphics({ add: false });
    g.fillStyle(0x32cd32);
    g.fillCircle(12, 12, 10);
    g.fillCircle(4, 6, 4);
    g.fillCircle(20, 6, 4);
    g.fillStyle(0x006400);
    g.fillCircle(9, 10, 3);
    g.fillCircle(15, 10, 3);
    g.generateTexture('bacteria', 24, 24);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x708090);
    g.fillCircle(12, 12, 10);
    g.fillStyle(0xa0aec0, 0.5);
    g.fillCircle(9, 9, 4);
    g.fillStyle(0xff0000);
    g.fillCircle(8, 14, 2);
    g.fillCircle(16, 14, 2);
    g.generateTexture('lead', 24, 24);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x8b4513);
    g.fillCircle(12, 12, 10);
    g.fillStyle(0xcd853f, 0.6);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0xa0522d);
    g.fillCircle(14, 14, 4);
    g.generateTexture('rust', 24, 24);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x3d2b1f);
    g.fillCircle(12, 12, 10);
    g.fillStyle(0x1a1a0a, 0.7);
    g.fillCircle(10, 10, 5);
    g.fillStyle(0x556b2f);
    g.fillCircle(14, 8, 3);
    g.generateTexture('sewage', 24, 24);
    g.destroy();
}

function createPowerUpTextures(scene) {
    let g = scene.make.graphics({ add: false });
    g.fillStyle(0x00ffff);
    g.fillTriangle(12, 0, 0, 12, 12, 24);
    g.fillTriangle(12, 0, 24, 12, 12, 24);
    g.fillStyle(0xffffff, 0.4);
    g.fillTriangle(12, 4, 4, 12, 12, 20);
    g.generateTexture('filter', 24, 24);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0xffff00);
    g.fillTriangle(14, 0, 4, 12, 12, 12);
    g.fillTriangle(12, 12, 20, 12, 10, 24);
    g.fillStyle(0xffffff, 0.3);
    g.fillTriangle(13, 3, 7, 11, 12, 11);
    g.generateTexture('speedboost', 24, 24);
    g.destroy();
}

function createLifeTexture(scene) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x00bfff);
    g.fillCircle(8, 10, 6);
    g.fillTriangle(8, 2, 3, 8, 13, 8);
    g.generateTexture('life', 16, 18);
    g.destroy();
}

// UI Screens
function buildStartScreen(scene) {
    startGroup = scene.add.group();

    const bg = scene.add.rectangle(240, 320, 480, 640, 0x000000, 0.88).setDepth(50);
    startGroup.add(bg);

    const logoBox = scene.add.rectangle(240, 120, 140, 90, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51);
    startGroup.add(logoBox);
    const wave = scene.add.rectangle(240, 95, 120, 16, 0xffffff).setDepth(51);
    startGroup.add(wave);
    const sjwd = scene.add.text(240, 118, 'SJWD', {
        fontFamily: 'Arial', fontSize: '24px', fill: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(sjwd);
    const sub = scene.add.text(240, 148, 'WATER DISTRICT', {
        fontFamily: 'Arial', fontSize: '8px', fill: '#000000',
        backgroundColor: '#ffffff', padding: { x: 6, y: 3 }
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(sub);

    const title = scene.add.text(240, 210, 'DROP CATCHER', {
        fontFamily: FONT, fontSize: '22px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(title);

    const subtitle = scene.add.text(240, 240, 'Save Every Drop!', {
        fontFamily: FONT, fontSize: '10px', fill: '#ffffff'
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(subtitle);

    const instr = scene.add.text(240, 290, 'Catch water drops\nwith your bucket!\n\nAvoid contaminants!\nGrab power-ups!', {
        fontFamily: FONT, fontSize: '9px', fill: '#aaaaaa', align: 'center', lineSpacing: 6
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(instr);

    const controls = scene.add.text(240, 400, 'Arrow Keys / A-D / Touch', {
        fontFamily: FONT, fontSize: '9px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(controls);

    const legendItems = [
        { name: 'Bacteria', color: '#32cd32' },
        { name: 'Lead', color: '#708090' },
        { name: 'Rust', color: '#8b4513' },
        { name: 'Sewage', color: '#3d2b1f' }
    ];
    legendItems.forEach((item, i) => {
        const lx = 120 + i * 90;
        const dot = scene.add.circle(lx, 360, 6, Phaser.Display.Color.HexStringToColor(item.color).color).setDepth(51);
        startGroup.add(dot);
        const lbl = scene.add.text(lx, 374, item.name, {
            fontFamily: FONT, fontSize: '6px', fill: item.color
        }).setOrigin(0.5, 0).setDepth(51);
        startGroup.add(lbl);
    });

    const btnBg = scene.add.rectangle(240, 480, 220, 50, 0x4a5568).setStrokeStyle(3, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    startGroup.add(btnBg);
    const btnText = scene.add.text(240, 480, 'START CATCHING', {
        fontFamily: FONT, fontSize: '12px', fill: '#00bfff'
    }).setOrigin(0.5).setDepth(51);
    startGroup.add(btnText);

    btnBg.on('pointerover', () => { btnBg.setFillStyle(0x718096); btnText.setFill('#ffffff'); });
    btnBg.on('pointerout', () => { btnBg.setFillStyle(0x4a5568); btnText.setFill('#00bfff'); });
    btnBg.on('pointerdown', () => startGamePlay(scene));

    scene.input.keyboard.on('keydown-SPACE', () => { if (!gameStarted) startGamePlay(scene); });
    scene.input.keyboard.on('keydown-ENTER', () => { if (!gameStarted) startGamePlay(scene); });
}

function buildGameOverScreen(scene) {
    // Game over UI is dynamically built by showGameOverScreen()
    scene.input.keyboard.on('keydown-SPACE', () => { if (gameOver) restartGamePlay(scene); });
    scene.input.keyboard.on('keydown-ENTER', () => { if (gameOver) restartGamePlay(scene); });
}

function startGamePlay(scene) {
    initAudio();
    gameStarted = true;
    startGroup.getChildren().forEach(c => c.setVisible(false));
    bucket.setVisible(true);
    scoreText.setVisible(true);
    levelText.setVisible(true);
    livesText.setVisible(true);
    missedText.setVisible(true);
}

function restartGamePlay(scene) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    score = 0; lives = 3; level = 1; missed = 0;
    gameOver = false; filterActive = false; speedActive = false;
    dropTimer = 0; contaminantTimer = 0; powerUpTimer = 0;
    bucket.setTint(0xffffff);
    filterIndicator.setVisible(false);
    speedIndicator.setVisible(false);

    scoreText.setText('SCORE: 0');
    levelText.setText('LEVEL 1');
    updateLivesDisplay();
    updateMissedDisplay();

    drops.clear(true, true);
    contaminants.clear(true, true);
    powerUps.clear(true, true);

    bucket.setVisible(true);
    bucket.setPosition(240, 580);
}
