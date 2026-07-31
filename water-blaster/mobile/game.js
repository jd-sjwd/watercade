// Water Blaster (Mobile) - SJWD Water District
// Portrait-first build of the Space Invaders-style arcade game.
// Layout is 480x854 (9:16) and scales to fit any phone. The cannon is dragged
// with a finger and fires automatically, so no thumb has to sit on a button.

const GW = 480, GH = 854;

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
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

const FONT = "'Press Start 2P', 'Courier New', monospace";

const PLAYER_Y = 752;
const PLAYER_MIN_X = 28, PLAYER_MAX_X = GW - 28;
const ENEMY_FLOOR = 700;      // enemies this low mean the supply is lost

let player, cursors, playerBullets, enemyBullets, enemies, powerUpGroup;
let score = 0, lives = 3, wave = 1;
let scoreText, livesText, waveText, powerUpIndicator;
let gameOver = false, gameStarted = false;
let startGroup, gameOverGroup;
let lastFire = 0, fireRate = 350;
let spreadShot = false, rapidFire = false, shieldActive = false;
let spreadTimer = 0, rapidTimer = 0;
let enemyDir = 1, enemySpeed = 30, stepDown = false;
let enemyShootTimer = 0;
let bossActive = false, boss = null;
let waveCleared = true, waveDelay = 0;
let shieldSprite = null;
let eduText = null, eduBg = null, eduTimer = 10;
let dragOffset = 0, dragging = false;
let touchHint = null;

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

function buzz(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

// Shared helper: a chunky, finger-sized button drawn inside the canvas.
function touchButton(scene, x, y, w, h, label, strokeHex, textColor, onTap, fontSize) {
    const bg = scene.add.rectangle(0, 0, w, h, 0x1a3a5c)
        .setStrokeStyle(3, strokeHex)
        .setInteractive({ useHandCursor: true });
    const txt = scene.add.text(0, 0, label, {
        fontFamily: FONT, fontSize: fontSize || '13px', fill: textColor, align: 'center'
    }).setOrigin(0.5);
    const c = scene.add.container(x, y, [bg, txt]).setDepth(60).setSize(w, h);
    bg.on('pointerdown', () => { bg.setFillStyle(0x2a5a8c); buzz(12); onTap(); });
    bg.on('pointerup', () => bg.setFillStyle(0x1a3a5c));
    bg.on('pointerout', () => bg.setFillStyle(0x1a3a5c));
    return c;
}

function preload() {}

function create() {
    const scene = this;
    createTextures(scene);

    playerBullets = scene.physics.add.group();
    enemyBullets = scene.physics.add.group();
    enemies = scene.physics.add.group();
    powerUpGroup = scene.physics.add.group();

    player = scene.physics.add.sprite(GW / 2, PLAYER_Y, 'cannon');
    player.setCollideWorldBounds(true);
    player.body.setSize(36, 32);
    player.setVisible(false);

    // HUD
    scoreText = scene.add.text(16, 20, 'SCORE: 0', {
        fontFamily: FONT, fontSize: '12px', fill: '#00bfff'
    }).setDepth(10).setVisible(false);
    waveText = scene.add.text(GW - 16, 20, 'WAVE 1', {
        fontFamily: FONT, fontSize: '12px', fill: '#ffff00'
    }).setOrigin(1, 0).setDepth(10).setVisible(false);
    livesText = scene.add.text(GW - 16, 46, '', {
        fontFamily: FONT, fontSize: '14px', fill: '#ff6b6b'
    }).setOrigin(1, 0).setDepth(10).setVisible(false);
    powerUpIndicator = scene.add.text(16, 46, '', {
        fontFamily: FONT, fontSize: '9px', fill: '#00ffff'
    }).setDepth(10).setVisible(false);

    // Educational info bar, tucked under the cannon
    eduBg = scene.add.rectangle(GW / 2, GH - 40, GW - 16, 62, 0x0a1628, 0.92)
        .setStrokeStyle(1, 0x2a4a6a).setDepth(8).setAlpha(0);
    eduText = scene.add.text(GW / 2, GH - 40, '', {
        fontFamily: FONT, fontSize: '7px', fill: '#88ccff', align: 'center',
        wordWrap: { width: GW - 40 }, lineSpacing: 5
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

    setupTouch(scene);

    // Sits just above the cannon, clear of the sprite and the info bar.
    touchHint = scene.add.text(GW / 2, 700, 'DRAG TO AIM  •  AUTO-FIRE ON', {
        fontFamily: FONT, fontSize: '9px', fill: '#4a90d9'
    }).setOrigin(0.5).setDepth(9).setVisible(false);

    buildStartScreen(scene);
    buildGameOverScreen(scene);
    updateLives();
}

// Drag anywhere to steer. Grabbing near the cannon keeps a relative offset so
// a thumb never has to cover the ship; grabbing far away snaps it over.
function setupTouch(scene) {
    scene.input.on('pointerdown', (pointer) => {
        if (!gameStarted || gameOver) return;
        dragging = true;
        const delta = player.x - pointer.x;
        dragOffset = Math.abs(delta) < 130 ? delta : 0;
        movePlayerTo(pointer.x + dragOffset);
    });
    scene.input.on('pointermove', (pointer) => {
        if (!gameStarted || gameOver || !pointer.isDown) return;
        movePlayerTo(pointer.x + dragOffset);
    });
    scene.input.on('pointerup', () => { dragging = false; });
}

function movePlayerTo(x) {
    player.x = Phaser.Math.Clamp(x, PLAYER_MIN_X, PLAYER_MAX_X);
}

function update(time, delta) {
    if (!gameStarted || gameOver) return;
    const scene = this;

    // Keyboard steering still works on tablets with a keyboard.
    player.setVelocityX(0);
    const spd = 250;
    if (cursors.left.isDown || scene.wasd.left.isDown) {
        player.setVelocityX(-spd);
    } else if (cursors.right.isDown || scene.wasd.right.isDown) {
        player.setVelocityX(spd);
    }

    // Auto-fire: on a phone there is no room for a dedicated fire thumb.
    if (time > lastFire + (rapidFire ? fireRate / 2 : fireRate)) {
        lastFire = time;
        fireBullet(scene);
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
            showFloating(scene, GW / 2, 380, 'WAVE CLEARED!', '#00ff7f');
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

    // Cleanup offscreen — snapshot the array first, because destroy() splices
    // the element out of the group's internal array mid-forEach.
    [...playerBullets.getChildren()].forEach(b => { if (b.y < -10) b.destroy(); });
    [...enemyBullets.getChildren()].forEach(b => { if (b.y > GH + 20) b.destroy(); });
    [...powerUpGroup.getChildren()].forEach(p => { if (p.y > GH + 20) p.destroy(); });

    enemies.getChildren().forEach(e => {
        if (e.y > ENEMY_FLOOR) { endGame(scene); }
    });
}

function fireBullet(scene) {
    if (spreadShot) {
        [-20, 0, 20].forEach(offset => {
            const b = scene.physics.add.sprite(player.x + offset, player.y - 20, 'bullet');
            playerBullets.add(b);
            b.setVelocityY(-460);
            b.body.setSize(6, 14);
        });
    } else {
        const b = scene.physics.add.sprite(player.x, player.y - 20, 'bullet');
        playerBullets.add(b);
        b.setVelocityY(-460);
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

    // Centre the formation: on a narrow phone a left-anchored grid leaves the
    // right half of the screen empty.
    const startX = GW / 2 - ((cols - 1) * 48) / 2;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = startX + c * 48;
            const y = 130 + r * 48;
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
    boss = scene.physics.add.sprite(GW / 2, 150, 'boss');
    enemies.add(boss);
    boss.setData('points', 500);
    boss.setData('hp', 15 + wave * 3);
    boss.setData('type', 'boss');
    boss.setData('dir', 1);
    boss.body.setSize(60, 48);
    showFloating(scene, GW / 2, 280, 'CONTAMINATION\nEVENT!', '#ff0000');
}

function moveEnemies(delta) {
    let hitEdge = false;
    enemies.getChildren().forEach(e => {
        e.x += enemyDir * (enemySpeed + wave * 5) * delta / 1000;
        if (e.x > GW - 25 || e.x < 25) hitEdge = true;
    });
    if (hitEdge) {
        enemyDir *= -1;
        enemies.getChildren().forEach(e => { e.y += 14; });
    }
}

function moveBoss(delta) {
    if (!boss || !boss.active) return;
    const dir = boss.getData('dir');
    boss.x += dir * 100 * delta / 1000;
    if (boss.x > GW - 60) boss.setData('dir', -1);
    if (boss.x < 60) boss.setData('dir', 1);
    boss.y = 150 + Math.sin(Date.now() / 500) * 15;
}

function enemyShoot(scene) {
    const active = enemies.getChildren().filter(e => e.active);
    if (active.length === 0) return;
    const shooter = Phaser.Utils.Array.GetRandom(active);
    const b = scene.physics.add.sprite(shooter.x, shooter.y + 14, 'ebullet');
    enemyBullets.add(b);
    b.setVelocityY(190 + wave * 15);
    b.body.setSize(6, 10);
}

function bossShoot(scene) {
    if (!boss || !boss.active) return;
    for (let i = -1; i <= 1; i++) {
        const b = scene.physics.add.sprite(boss.x + i * 20, boss.y + 30, 'ebullet');
        enemyBullets.add(b);
        b.setVelocityY(210);
        b.setVelocityX(i * 40);
        b.body.setSize(6, 10);
    }
}

function bulletHitEnemy(bullet, enemy) {
    // Guard: Phaser can queue multiple callbacks for the same pair in one
    // physics step before any destroy() is processed — skip stale calls.
    if (!bullet.active || !enemy.active) return;
    const scene = bullet.scene;
    bullet.destroy();
    if (enemy.getData('type') === 'boss') {
        let hp = enemy.getData('hp') - 1;
        enemy.setData('hp', hp);
        enemy.setTint(0xff0000);
        scene.time.delayedCall(100, () => { if (enemy.active) enemy.clearTint(); });
        if (hp <= 0) {
            explosionEffect(scene, enemy.x, enemy.y, 12);
            score += enemy.getData('points');
            scoreText.setText('SCORE: ' + score);
            showFloating(scene, enemy.x, enemy.y, '+500', '#ffff00');
            showEduFact(scene, 'boss');
            buzz([20, 40, 20]);
            enemy.destroy();
            boss = null;
            bossActive = false;
        }
        return;
    }
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
    if (!plyr.active || !bullet.active) return;
    const scene = bullet.scene;
    bullet.destroy();
    if (shieldActive) {
        shieldActive = false;
        if (shieldSprite) { shieldSprite.destroy(); shieldSprite = null; }
        showFloating(scene, player.x, player.y - 40, 'BLOCKED!', '#00ff00');
        updatePowerUpText();
        return;
    }
    redFlash(scene);
    buzz([30, 40, 30]);
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
    p.setVelocityY(90);
    p.body.setSize(20, 20);
}

function collectPowerUp(plyr, pu) {
    if (!plyr.active || !pu.active) return;
    const scene = pu.scene;
    const type = pu.getData('type');
    buzz(20);
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
    const flash = scene.add.rectangle(GW/2, GH/2, GW, GH, 0xff0000, 0.3).setDepth(5);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
}

function showEduFact(scene, type) {
    const facts = EDU_FACTS[type];
    if (!facts || !eduText) return;
    const fact = Phaser.Utils.Array.GetRandom(facts);
    eduText.setText(fact);
    eduBg.setAlpha(0.92);
    eduText.setAlpha(1);
    scene.tweens.killTweensOf(eduText);
    scene.tweens.killTweensOf(eduBg);
    eduTimer = 5000;
}

function showFloating(scene, x, y, msg, color) {
    const txt = scene.add.text(x, y, msg, {
        fontFamily: FONT, fontSize: '15px', fill: color, align: 'center'
    }).setOrigin(0.5).setDepth(20);
    scene.tweens.add({ targets: txt, y: y - 60, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
}

function updateLives() {
    let t = '';
    for (let i = 0; i < lives; i++) t += '♥ ';
    if (livesText) livesText.setText(t.trim());
}

function endGame(scene) {
    if (gameOver) return;
    gameOver = true;
    buzz([60, 60, 120]);
    player.setVisible(false);
    if (touchHint) touchHint.setVisible(false);
    enemies.clear(true, true);
    playerBullets.clear(true, true);
    enemyBullets.clear(true, true);
    powerUpGroup.clear(true, true);
    if (shieldSprite) { shieldSprite.destroy(); shieldSprite = null; }
    if (eduText) { eduText.setAlpha(0); eduBg.setAlpha(0); }
    gameOverGroup.getChildren().forEach(c => c.setVisible(true));
    const fs = gameOverGroup.getChildren().find(c => c.getData && c.getData('id') === 'finalScore');
    if (fs) fs.setText('SCORE: ' + score + '\nWAVE: ' + wave);
}

// Textures
function createTextures(scene) {
    let g;

    // Player cannon
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

    // Player bullet
    g = scene.make.graphics({ add: false });
    g.fillStyle(0x00bfff);
    g.fillRoundedRect(1, 0, 6, 14, 3);
    g.fillStyle(0x80dfff, 0.5);
    g.fillRoundedRect(2, 2, 4, 6, 2);
    g.generateTexture('bullet', 8, 14);
    g.destroy();

    // Enemy bullet
    g = scene.make.graphics({ add: false });
    g.fillStyle(0xff4444);
    g.fillCircle(4, 5, 4);
    g.fillTriangle(4, 0, 0, 5, 8, 5);
    g.generateTexture('ebullet', 8, 10);
    g.destroy();

    // Lead enemy
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

    // Bacteria enemy
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

    // Chlorine enemy
    g = scene.make.graphics({ add: false });
    g.fillStyle(0x9acd32);
    g.fillCircle(14, 14, 11);
    g.fillStyle(0x556b2f);
    g.fillCircle(10, 10, 4);
    g.fillCircle(18, 10, 4);
    g.fillCircle(14, 18, 4);
    g.generateTexture('chlorine', 28, 28);
    g.destroy();

    // Rust enemy
    g = scene.make.graphics({ add: false });
    g.fillStyle(0x8b4513);
    g.fillCircle(14, 14, 11);
    g.fillStyle(0xcd853f);
    g.fillCircle(10, 10, 5);
    g.fillStyle(0xa0522d);
    g.fillCircle(16, 16, 4);
    g.generateTexture('rust_e', 28, 28);
    g.destroy();

    // Boss
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

    // Power-ups
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
    startGroup.add(scene.add.rectangle(GW/2, GH/2, GW, GH, 0x000000, 0.9).setDepth(50));

    // SJWD Logo
    startGroup.add(scene.add.rectangle(GW/2, 128, 160, 104, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51));
    startGroup.add(scene.add.rectangle(GW/2, 98, 136, 18, 0xffffff).setDepth(51));
    startGroup.add(scene.add.text(GW/2, 126, 'SJWD', { fontFamily: 'Arial', fontSize: '28px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(GW/2, 160, 'WATER DISTRICT', { fontFamily: 'Arial', fontSize: '9px', fill: '#000', backgroundColor: '#fff', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(GW/2, 248, 'WATER BLASTER', { fontFamily: FONT, fontSize: '20px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(GW/2, 282, 'Purify the Supply!', { fontFamily: FONT, fontSize: '11px', fill: '#ffffff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(GW/2, 372, 'Shoot down contaminants\nbefore they reach\nthe water supply!\n\nCollect power-ups!', {
        fontFamily: FONT, fontSize: '11px', fill: '#aaa', align: 'center', lineSpacing: 10
    }).setOrigin(0.5).setDepth(51));

    const legend = [
        { n: 'Lead', c: '#708090' }, { n: 'Bacteria', c: '#32cd32' },
        { n: 'Chlorine', c: '#9acd32' }, { n: 'Rust', c: '#8b4513' }
    ];
    legend.forEach((it, i) => {
        const lx = 78 + i * 108;
        startGroup.add(scene.add.circle(lx, 484, 8, Phaser.Display.Color.HexStringToColor(it.c).color).setDepth(51));
        startGroup.add(scene.add.text(lx, 500, it.n, { fontFamily: FONT, fontSize: '7px', fill: it.c }).setOrigin(0.5, 0).setDepth(51));
    });

    startGroup.add(scene.add.text(GW/2, 556, 'DRAG TO AIM  •  AUTO-FIRE', { fontFamily: FONT, fontSize: '10px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(touchButton(scene, GW/2, 650, 340, 80, 'START BLASTING', 0x00bfff, '#00bfff', () => startPlay(scene), '14px').setDepth(51));
    startGroup.add(touchButton(scene, GW/2, 752, 260, 60, 'ARCADE HUB', 0x4a90d9, '#4a90d9', () => { window.location.href = '../../mobile/'; }, '10px').setDepth(51));

    scene.input.keyboard.on('keydown-ENTER', () => { if (!gameStarted) startPlay(scene); });
}

function buildGameOverScreen(scene) {
    gameOverGroup = scene.add.group();
    gameOverGroup.add(scene.add.rectangle(GW/2, GH/2, GW, GH, 0x000000, 0.9).setDepth(50).setVisible(false));
    gameOverGroup.add(scene.add.text(GW/2, 280, 'GAME OVER', { fontFamily: FONT, fontSize: '26px', fill: '#ff0000' }).setOrigin(0.5).setDepth(51).setVisible(false));
    const fs = scene.add.text(GW/2, 372, '', { fontFamily: FONT, fontSize: '14px', fill: '#ffff00', align: 'center', lineSpacing: 12 }).setOrigin(0.5).setDepth(51).setVisible(false);
    fs.setData('id', 'finalScore');
    gameOverGroup.add(fs);

    gameOverGroup.add(touchButton(scene, GW/2, 500, 340, 80, 'PLAY AGAIN', 0x00bfff, '#00bfff', () => restartPlay(scene), '14px').setVisible(false));
    gameOverGroup.add(touchButton(scene, GW/2, 604, 260, 64, 'ARCADE HUB', 0x4a90d9, '#4a90d9', () => { window.location.href = '../../mobile/'; }, '10px').setVisible(false));

    scene.input.keyboard.on('keydown-ENTER', () => { if (gameOver) restartPlay(scene); });
}

function startPlay(scene) {
    gameStarted = true;
    [...startGroup.getChildren()].forEach(c => c.destroy());
    player.setVisible(true);
    scoreText.setVisible(true);
    waveText.setVisible(true);
    livesText.setVisible(true);
    powerUpIndicator.setVisible(true);
    if (touchHint) {
        touchHint.setVisible(true).setAlpha(1);
        scene.tweens.add({ targets: touchHint, alpha: 0.25, delay: 3500, duration: 900 });
    }
    spawnWave(scene);
}

function restartPlay(scene) {
    score = 0; lives = 3; wave = 1;
    gameOver = false; bossActive = false; boss = null;
    spreadShot = false; rapidFire = false; shieldActive = false;
    // Restart from wave 1 directly rather than letting the wave-clear timer
    // advance the counter on the first frame.
    waveCleared = false; waveDelay = 0; enemyShootTimer = 0;
    if (shieldSprite) { shieldSprite.destroy(); shieldSprite = null; }
    scoreText.setText('SCORE: 0');
    waveText.setText('WAVE 1');
    updateLives();
    updatePowerUpText();

    enemies.clear(true, true);
    playerBullets.clear(true, true);
    enemyBullets.clear(true, true);
    powerUpGroup.clear(true, true);

    gameOverGroup.getChildren().forEach(c => c.setVisible(false));
    player.setVisible(true);
    player.setPosition(GW / 2, PLAYER_Y);
    if (touchHint) touchHint.setVisible(true).setAlpha(0.25);

    spawnWave(scene);
}
