// Water Blaster - SJWD Water District
// Space Invaders-style arcade game

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
const GAME_ID = 'water-blaster';

let player, cursors, playerBullets, enemyBullets, enemies, powerUpGroup;
let score = 0, lives = 3, wave = 1;
let scoreText, livesText, waveText, powerUpIndicator;
let gameOver = false, gameStarted = false;
let startGroup;
let lbGroup = null;
let lastFire = 0, fireRate = 350;
let spreadShot = false, rapidFire = false, shieldActive = false;
let spreadTimer = 0, rapidTimer = 0;
let enemyDir = 1, enemySpeed = 30, stepDown = false;
let enemyShootTimer = 0;
let bossActive = false, boss = null;
let waveCleared = true, waveDelay = 0;
let shieldSprite = null;
let eduText = null, eduBg = null, eduTimer = 10;

// Educational contaminant facts
const EDU_FACTS = {
    lead: [
        'LEAD: Enters water through corroded pipes & solder. Removed by reverse osmosis or activated carbon filters.',
        'LEAD: Even low levels are harmful to children. Water districts replace lead service lines to protect health.',
        'LEAD: No safe level of lead in drinking water. Flushing taps for 30 seconds reduces lead exposure.'
    ],
    bacteria: [
        'BACTERIA: E. coli & coliform can cause illness. Killed by chlorine disinfection & UV treatment.',
        'BACTERIA: Water districts test for bacteria daily. Chlorine residual in pipes prevents regrowth.',
        'BACTERIA: Boil water advisories are issued when bacteria is detected. Boiling for 1 minute kills pathogens.'
    ],
    chlorine: [
        'CHLORINE: Added to kill germs, but excess causes taste issues. Removed by activated carbon filters.',
        'CHLORINE: Water districts carefully balance chlorine levels - enough to disinfect, not enough to taste.',
        'CHLORINE: Letting tap water sit uncovered for 24 hours allows chlorine to evaporate naturally.'
    ],
    rust_e: [
        'RUST: Iron oxide from aging pipes discolors water. Removed by oxidation filters & water softeners.',
        'RUST: While unsightly, rust in water is not usually a health hazard. Flushing the tap clears it.',
        'RUST: Water districts use corrosion control treatment to prevent pipe deterioration.'
    ],
    boss: [
        'Multiple contaminants can combine in aging infrastructure. Regular water quality testing keeps you safe!',
        'Your water district tests for 90+ contaminants to meet Safe Drinking Water Act standards.',
        'Water treatment uses multiple barriers: coagulation, sedimentation, filtration, and disinfection.'
    ]
};

// --- Audio (Web Audio API) ---
let audioCtx = null;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function sfxShoot() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.start(t); osc.stop(t + 0.09);
}
function sfxExplode() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.18, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const n = audioCtx.createBufferSource(); n.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtValue(0.001, t + 0.18);
    n.connect(f); f.connect(g); g.connect(audioCtx.destination);
    n.start(t); n.stop(t + 0.18);
}
function sfxBossExplode() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [220, 180, 140, 110, 80].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t + i * 0.12);
        g.gain.setValueAtTime(0.12, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.20);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.20);
    });
}
function sfxHit() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.22);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.start(t); osc.stop(t + 0.22);
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
function sfxWaveClear() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.10);
        g.gain.setValueAtTime(0.10, t + i * 0.10);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.10 + 0.18);
        o.start(t + i * 0.10); o.stop(t + i * 0.10 + 0.18);
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
    createTextures(scene);

    playerBullets = scene.physics.add.group();
    enemyBullets = scene.physics.add.group();
    enemies = scene.physics.add.group();
    powerUpGroup = scene.physics.add.group();

    player = scene.physics.add.sprite(240, 575, 'cannon');
    player.setCollideWorldBounds(true);
    player.body.setSize(36, 32);
    player.setVisible(false);

    // HUD
    scoreText = scene.add.text(16, 16, 'SCORE: 0', {
        fontFamily: FONT, fontSize: '11px', fill: '#00bfff'
    }).setDepth(10).setVisible(false);
    waveText = scene.add.text(240, 16, 'WAVE 1', {
        fontFamily: FONT, fontSize: '11px', fill: '#ffff00'
    }).setOrigin(0.5, 0).setDepth(10).setVisible(false);
    livesText = scene.add.text(464, 16, '', {
        fontFamily: FONT, fontSize: '11px', fill: '#ff6b6b'
    }).setOrigin(1, 0).setDepth(10).setVisible(false);
    powerUpIndicator = scene.add.text(16, 36, '', {
        fontFamily: FONT, fontSize: '8px', fill: '#00ffff'
    }).setDepth(10).setVisible(false);

    // Educational info bar
    eduBg = scene.add.rectangle(240, 618, 470, 36, 0x0a1628, 0.9)
        .setStrokeStyle(1, 0x2a4a6a).setDepth(8).setAlpha(0);
    eduText = scene.add.text(240, 618, '', {
        fontFamily: FONT, fontSize: '6px', fill: '#88ccff', align: 'center',
        wordWrap: { width: 450 }, lineSpacing: 4
    }).setOrigin(0.5).setDepth(9).setAlpha(0);

    // Collisions
    scene.physics.add.overlap(playerBullets, enemies, bulletHitEnemy, null, scene);
    scene.physics.add.overlap(enemyBullets, player, enemyHitPlayer, null, scene);
    scene.physics.add.overlap(player, powerUpGroup, collectPowerUp, null, scene);

    cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        fire: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    scene.input.on('pointerdown', () => initAudio());
    setupMobile(scene);

    buildStartScreen(scene);
    buildGameOverScreen(scene);
    updateLives();
}

function update(time, delta) {
    if (!gameStarted || gameOver) return;
    const scene = this;

    player.setVelocityX(0);
    const spd = 250;
    if (cursors.left.isDown || scene.wasd.left.isDown || scene.mobileLeft) {
        player.setVelocityX(-spd);
    } else if (cursors.right.isDown || scene.wasd.right.isDown || scene.mobileRight) {
        player.setVelocityX(spd);
    }

    if ((cursors.up.isDown || scene.wasd.fire.isDown || scene.mobileFire) && time > lastFire + (rapidFire ? fireRate / 2 : fireRate)) {
        lastFire = time;
        fireBullet(scene);
        sfxShoot();
    }

    if (shieldSprite && shieldActive) {
        shieldSprite.setPosition(player.x, player.y);
    }

    if (spreadShot) {
        spreadTimer -= delta;
        if (spreadTimer <= 0) { spreadShot = false; updatePowerUpText(); }
    }
    if (rapidFire) {
        rapidTimer -= delta;
        if (rapidTimer <= 0) { rapidFire = false; updatePowerUpText(); }
    }

    if (!bossActive) {
        moveEnemies(delta);
        enemyShootTimer += delta;
        if (enemyShootTimer > Math.max(600, 2000 - wave * 100)) {
            enemyShootTimer = 0;
            enemyShoot(scene);
        }
    } else if (boss && boss.active) {
        moveBoss(delta);
        enemyShootTimer += delta;
        if (enemyShootTimer > 800) {
            enemyShootTimer = 0;
            bossShoot(scene);
        }
    }

    if (enemies.countActive() === 0 && (!bossActive || (boss && !boss.active))) {
        if (!waveCleared) {
            waveCleared = true;
            waveDelay = time + 1500;
            sfxWaveClear();
            showFloating(scene, 240, 300, 'WAVE CLEARED!', '#00ff7f');
        }
    }
    if (waveCleared && waveDelay > 0 && time > waveDelay) {
        waveDelay = 0;
        wave++;
        waveText.setText('WAVE ' + wave);
        if (wave % 3 === 0) {
            spawnBoss(scene);
        } else {
            spawnWave(scene);
        }
    }

    if (eduTimer > 0) {
        eduTimer -= delta;
        if (eduTimer <= 0 && eduText) {
            scene.tweens.add({ targets: [eduText, eduBg], alpha: 0, duration: 500 });
        }
    }

    playerBullets.getChildren().forEach(b => { if (b.y < -10) b.destroy(); });
    enemyBullets.getChildren().forEach(b => { if (b.y > 660) b.destroy(); });
    powerUpGroup.getChildren().forEach(p => { if (p.y > 660) p.destroy(); });

    enemies.getChildren().forEach(e => {
        if (e.y > 560) { endGame(scene); }
    });
}

function fireBullet(scene) {
    if (spreadShot) {
        [-20, 0, 20].forEach(offset => {
            const b = scene.physics.add.sprite(player.x + offset, player.y - 20, 'bullet');
            playerBullets.add(b);
            b.setVelocityY(-400);
            b.body.setSize(6, 14);
        });
    } else {
        const b = scene.physics.add.sprite(player.x, player.y - 20, 'bullet');
        playerBullets.add(b);
        b.setVelocityY(-400);
        b.body.setSize(6, 14);
    }
}

function spawnWave(scene) {
    waveCleared = false;
    bossActive = false;
    enemyDir = 1;
    const types = ['lead', 'bacteria', 'chlorine', 'rust_e'];
    const points = [10, 20, 30, 40];
    const rows = Math.min(4, 2 + Math.floor(wave / 2));
    const cols = Math.min(8, 5 + Math.floor(wave / 3));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = 60 + c * 48;
            const y = 70 + r * 44;
            const e = scene.physics.add.sprite(x, y, types[r % 4]);
            enemies.add(e);
            e.setData('points', points[r % 4]);
            e.setData('type', types[r % 4]);
            e.body.setSize(24, 24);
        }
    }
}

function spawnBoss(scene) {
    waveCleared = false;
    bossActive = true;
    boss = scene.physics.add.sprite(240, 80, 'boss');
    enemies.add(boss);
    boss.setData('points', 500);
    boss.setData('hp', 15 + wave * 3);
    boss.setData('type', 'boss');
    boss.setData('dir', 1);
    boss.body.setSize(60, 48);
    showFloating(scene, 240, 200, 'CONTAMINATION EVENT!', '#ff0000');
}

function moveEnemies(delta) {
    let hitEdge = false;
    enemies.getChildren().forEach(e => {
        e.x += enemyDir * (enemySpeed + wave * 5) * delta / 1000;
        if (e.x > 455 || e.x < 25) hitEdge = true;
    });
    if (hitEdge) {
        enemyDir *= -1;
        enemies.getChildren().forEach(e => { e.y += 12; });
    }
}

function moveBoss(delta) {
    if (!boss || !boss.active) return;
    const dir = boss.getData('dir');
    boss.x += dir * 100 * delta / 1000;
    if (boss.x > 420) boss.setData('dir', -1);
    if (boss.x < 60) boss.setData('dir', 1);
    boss.y = 80 + Math.sin(Date.now() / 500) * 15;
}

function enemyShoot(scene) {
    const active = enemies.getChildren().filter(e => e.active);
    if (active.length === 0) return;
    const shooter = Phaser.Utils.Array.GetRandom(active);
    const b = scene.physics.add.sprite(shooter.x, shooter.y + 14, 'ebullet');
    enemyBullets.add(b);
    b.setVelocityY(180 + wave * 15);
    b.body.setSize(6, 10);
}

function bossShoot(scene) {
    if (!boss || !boss.active) return;
    for (let i = -1; i <= 1; i++) {
        const b = scene.physics.add.sprite(boss.x + i * 20, boss.y + 30, 'ebullet');
        enemyBullets.add(b);
        b.setVelocityY(200);
        b.setVelocityX(i * 40);
        b.body.setSize(6, 10);
    }
}

function bulletHitEnemy(bullet, enemy) {
    const scene = bullet.scene;
    bullet.destroy();
    if (enemy.getData('type') === 'boss') {
        let hp = enemy.getData('hp') - 1;
        enemy.setData('hp', hp);
        enemy.setTint(0xff0000);
        scene.time.delayedCall(100, () => { if (enemy.active) enemy.clearTint(); });
        if (hp <= 0) {
            sfxBossExplode();
            explosionEffect(scene, enemy.x, enemy.y, 12);
            score += enemy.getData('points');
            scoreText.setText('SCORE: ' + score);
            showFloating(scene, enemy.x, enemy.y, '+500', '#ffff00');
            showEduFact(scene, 'boss');
            enemy.destroy();
            boss = null;
            bossActive = false;
        }
        return;
    }
    sfxExplode();
    explosionEffect(scene, enemy.x, enemy.y, 6);
    const enemyType = enemy.getData('type');
    score += enemy.getData('points');
    scoreText.setText('SCORE: ' + score);

    if (Phaser.Math.Between(0, 100) < 30) {
        showEduFact(scene, enemyType);
    }
    if (Phaser.Math.Between(0, 100) < 12) {
        dropPowerUp(scene, enemy.x, enemy.y);
    }
    enemy.destroy();
}

function enemyHitPlayer(plyr, bullet) {
    const scene = bullet.scene;
    bullet.destroy();
    if (shieldActive) {
        shieldActive = false;
        if (shieldSprite) { shieldSprite.destroy(); shieldSprite = null; }
        showFloating(scene, player.x, player.y - 30, 'BLOCKED!', '#00ff00');
        updatePowerUpText();
        return;
    }
    sfxHit();
    redFlash(scene);
    lives--;
    updateLives();
    if (lives <= 0) endGame(scene);
}

function dropPowerUp(scene, x, y) {
    const type = Phaser.Math.Between(0, 2);
    const keys = ['pu_spread', 'pu_rapid', 'pu_shield'];
    const p = scene.physics.add.sprite(x, y, keys[type]);
    powerUpGroup.add(p);
    p.setData('type', type);
    p.setVelocityY(80);
    p.body.setSize(20, 20);
}

function collectPowerUp(plyr, pu) {
    const scene = pu.scene;
    const type = pu.getData('type');
    sfxPowerUp();
    if (type === 0) {
        spreadShot = true; spreadTimer = 10000;
        showFloating(scene, pu.x, pu.y, 'SPREAD!', '#00ffff');
    } else if (type === 1) {
        rapidFire = true; rapidTimer = 10000;
        showFloating(scene, pu.x, pu.y, 'RAPID!', '#ffff00');
    } else {
        shieldActive = true;
        if (shieldSprite) shieldSprite.destroy();
        shieldSprite = scene.add.circle(player.x, player.y, 24, 0x00ff00, 0.25).setStrokeStyle(2, 0x00ff00);
        showFloating(scene, pu.x, pu.y, 'SHIELD!', '#00ff00');
    }
    updatePowerUpText();
    pu.destroy();
}

function updatePowerUpText() {
    let txt = '';
    if (spreadShot) txt += 'SPREAD ';
    if (rapidFire) txt += 'RAPID ';
    if (shieldActive) txt += 'SHIELD';
    powerUpIndicator.setText(txt);
}

function explosionEffect(scene, x, y, count) {
    for (let i = 0; i < count; i++) {
        const colors = [0xff6600, 0xffaa00, 0xff0000, 0xffff00];
        const p = scene.add.circle(x, y, Phaser.Math.Between(2, 5), Phaser.Utils.Array.GetRandom(colors));
        scene.tweens.add({
            targets: p,
            x: x + Phaser.Math.Between(-40, 40),
            y: y + Phaser.Math.Between(-40, 40),
            alpha: 0, scale: 0.1, duration: 500,
            onComplete: () => p.destroy()
        });
    }
}

function redFlash(scene) {
    const flash = scene.add.rectangle(240, 320, 480, 640, 0xff0000, 0.3).setDepth(5);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
}

function showEduFact(scene, type) {
    const facts = EDU_FACTS[type];
    if (!facts || !eduText) return;
    const fact = Phaser.Utils.Array.GetRandom(facts);
    eduText.setText(fact);
    eduBg.setAlpha(0.9);
    eduText.setAlpha(1);
    scene.tweens.killTweensOf(eduText);
    scene.tweens.killTweensOf(eduBg);
    eduTimer = 5000;
}

function showFloating(scene, x, y, msg, color) {
    const txt = scene.add.text(x, y, msg, {
        fontFamily: FONT, fontSize: '14px', fill: color
    }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({ targets: txt, y: y - 50, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
}

function updateLives() {
    let t = '';
    for (let i = 0; i < lives; i++) t += '♥ ';
    if (livesText) livesText.setText(t.trim());
}

function endGame(scene) {
    gameOver = true;
    player.setVisible(false);
    enemies.clear(true, true);
    playerBullets.clear(true, true);
    enemyBullets.clear(true, true);
    powerUpGroup.clear(true, true);
    if (shieldSprite) { shieldSprite.destroy(); shieldSprite = null; }
    if (eduText) { eduText.setAlpha(0); eduBg.setAlpha(0); }
    sfxGameOver();
    const subtitleLines = ['SCORE: ' + score, 'WAVE: ' + wave];
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
    scene.mobileLeft = false;
    scene.mobileRight = false;
    scene.mobileFire = false;
    const btnL = document.getElementById('btn-left');
    const btnR = document.getElementById('btn-right');
    const btnF = document.getElementById('btn-fire');
    if (btnL) {
        btnL.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); scene.mobileLeft = true; });
        btnL.addEventListener('touchend', () => { scene.mobileLeft = false; });
    }
    if (btnR) {
        btnR.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); scene.mobileRight = true; });
        btnR.addEventListener('touchend', () => { scene.mobileRight = false; });
    }
    if (btnF) {
        btnF.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); scene.mobileFire = true; });
        btnF.addEventListener('touchend', () => { scene.mobileFire = false; });
    }
}

// Textures
function createTextures(scene) {
    let g;

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x2196f3);
    g.fillRect(16, 20, 16, 20);
    g.fillStyle(0x1976d2);
    g.fillRect(6, 30, 36, 14);
    g.fillStyle(0x64b5f6);
    g.fillRect(20, 8, 8, 14);
    g.fillStyle(0x00bfff);
    g.fillCircle(24, 8, 4);
    g.generateTexture('cannon', 48, 44);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x00bfff);
    g.fillRoundedRect(1, 0, 6, 14, 3);
    g.fillStyle(0x80dfff, 0.5);
    g.fillRoundedRect(2, 2, 4, 6, 2);
    g.generateTexture('bullet', 8, 14);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0xff4444);
    g.fillCircle(4, 5, 4);
    g.fillTriangle(4, 0, 0, 5, 8, 5);
    g.generateTexture('ebullet', 8, 10);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x708090);
    g.fillCircle(14, 14, 12);
    g.fillStyle(0xa0aec0, 0.5);
    g.fillCircle(10, 10, 5);
    g.fillStyle(0xff0000);
    g.fillCircle(10, 16, 2);
    g.fillCircle(18, 16, 2);
    g.generateTexture('lead', 28, 28);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x32cd32);
    g.fillCircle(14, 14, 11);
    g.fillCircle(5, 8, 5);
    g.fillCircle(23, 8, 5);
    g.fillStyle(0x006400);
    g.fillCircle(10, 12, 3);
    g.fillCircle(18, 12, 3);
    g.generateTexture('bacteria', 28, 28);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x9acd32);
    g.fillCircle(14, 14, 11);
    g.fillStyle(0x556b2f);
    g.fillCircle(10, 10, 4);
    g.fillCircle(18, 10, 4);
    g.fillCircle(14, 18, 4);
    g.generateTexture('chlorine', 28, 28);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x8b4513);
    g.fillCircle(14, 14, 11);
    g.fillStyle(0xcd853f);
    g.fillCircle(10, 10, 5);
    g.fillStyle(0xa0522d);
    g.fillCircle(16, 16, 4);
    g.generateTexture('rust_e', 28, 28);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x800080);
    g.fillRoundedRect(4, 4, 64, 48, 8);
    g.fillStyle(0x9b59b6);
    g.fillRoundedRect(8, 8, 56, 40, 6);
    g.fillStyle(0xff0000);
    g.fillCircle(22, 24, 6);
    g.fillCircle(50, 24, 6);
    g.fillStyle(0xffff00);
    g.fillCircle(22, 24, 3);
    g.fillCircle(50, 24, 3);
    g.fillStyle(0xff00ff);
    g.fillRect(28, 34, 16, 6);
    g.generateTexture('boss', 72, 56);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x00ffff);
    g.fillTriangle(12, 0, 0, 12, 12, 24);
    g.fillTriangle(12, 0, 24, 12, 12, 24);
    g.generateTexture('pu_spread', 24, 24);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0xffff00);
    g.fillTriangle(14, 0, 4, 12, 12, 12);
    g.fillTriangle(12, 12, 20, 12, 10, 24);
    g.generateTexture('pu_rapid', 24, 24);
    g.destroy();

    g = scene.make.graphics({ add: false });
    g.fillStyle(0x00ff00);
    g.fillCircle(12, 12, 10);
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(12, 12, 6);
    g.generateTexture('pu_shield', 24, 24);
    g.destroy();
}

// UI Screens
function buildStartScreen(scene) {
    startGroup = scene.add.group();
    const bg = scene.add.rectangle(240, 320, 480, 640, 0x000000, 0.88).setDepth(50);
    startGroup.add(bg);

    const logoBox = scene.add.rectangle(240, 110, 140, 90, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51);
    startGroup.add(logoBox);
    startGroup.add(scene.add.rectangle(240, 85, 120, 16, 0xffffff).setDepth(51));
    startGroup.add(scene.add.text(240, 108, 'SJWD', { fontFamily: 'Arial', fontSize: '24px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 138, 'WATER DISTRICT', { fontFamily: 'Arial', fontSize: '8px', fill: '#000', backgroundColor: '#fff', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 200, 'WATER BLASTER', { fontFamily: FONT, fontSize: '20px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 228, 'Purify the Supply!', { fontFamily: FONT, fontSize: '10px', fill: '#ffffff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 280, 'Shoot down contaminants\nbefore they reach\nthe water supply!\n\nCollect power-ups!', {
        fontFamily: FONT, fontSize: '9px', fill: '#aaa', align: 'center', lineSpacing: 6
    }).setOrigin(0.5).setDepth(51));

    const legend = [
        { n: 'Lead', c: '#708090' }, { n: 'Bacteria', c: '#32cd32' },
        { n: 'Chlorine', c: '#9acd32' }, { n: 'Rust', c: '#8b4513' }
    ];
    legend.forEach((it, i) => {
        const lx = 80 + i * 100;
        startGroup.add(scene.add.circle(lx, 360, 6, Phaser.Display.Color.HexStringToColor(it.c).color).setDepth(51));
        startGroup.add(scene.add.text(lx, 374, it.n, { fontFamily: FONT, fontSize: '6px', fill: it.c }).setOrigin(0.5, 0).setDepth(51));
    });

    startGroup.add(scene.add.text(240, 410, 'Arrows/WASD + Space', { fontFamily: FONT, fontSize: '9px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));

    const btnBg = scene.add.rectangle(240, 480, 220, 50, 0x4a5568).setStrokeStyle(3, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    startGroup.add(btnBg);
    const btnTxt = scene.add.text(240, 480, 'START BLASTING', { fontFamily: FONT, fontSize: '12px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51);
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
    player.setVisible(true);
    scoreText.setVisible(true);
    waveText.setVisible(true);
    livesText.setVisible(true);
    powerUpIndicator.setVisible(true);
    spawnWave(scene);
}

function restartPlay(scene) {
    if (lbGroup) { lbGroup.destroy(true); lbGroup = null; }
    score = 0; lives = 3; wave = 1;
    gameOver = false; bossActive = false; boss = null;
    spreadShot = false; rapidFire = false; shieldActive = false;
    waveCleared = true; waveDelay = 0;
    if (shieldSprite) { shieldSprite.destroy(); shieldSprite = null; }
    scoreText.setText('SCORE: 0');
    waveText.setText('WAVE 1');
    updateLives();
    updatePowerUpText();

    enemies.clear(true, true);
    playerBullets.clear(true, true);
    enemyBullets.clear(true, true);
    powerUpGroup.clear(true, true);

    player.setVisible(true);
    player.setPosition(240, 575);

    waveDelay = player.scene.time.now + 500;
}
