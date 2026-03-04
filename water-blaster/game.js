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
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '11px', fill: '#00bfff'
    }).setDepth(10).setVisible(false);
    waveText = scene.add.text(240, 16, 'WAVE 1', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '11px', fill: '#ffff00'
    }).setOrigin(0.5, 0).setDepth(10).setVisible(false);
    livesText = scene.add.text(464, 16, '', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '11px', fill: '#ff6b6b'
    }).setOrigin(1, 0).setDepth(10).setVisible(false);
    powerUpIndicator = scene.add.text(16, 36, '', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '8px', fill: '#00ffff'
    }).setDepth(10).setVisible(false);

    // Educational info bar at bottom of game area
    eduBg = scene.add.rectangle(240, 618, 470, 36, 0x0a1628, 0.9)
        .setStrokeStyle(1, 0x2a4a6a).setDepth(8).setAlpha(0);
    eduText = scene.add.text(240, 618, '', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace",
        fontSize: '6px', fill: '#88ccff', align: 'center',
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

    // Mobile controls
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
    }

    // Shield follow
    if (shieldSprite && shieldActive) {
        shieldSprite.setPosition(player.x, player.y);
    }

    // Power-up timers
    if (spreadShot) {
        spreadTimer -= delta;
        if (spreadTimer <= 0) { spreadShot = false; updatePowerUpText(); }
    }
    if (rapidFire) {
        rapidTimer -= delta;
        if (rapidTimer <= 0) { rapidFire = false; updatePowerUpText(); }
    }

    // Enemy movement
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

    // Check wave clear
    if (enemies.countActive() === 0 && (!bossActive || (boss && !boss.active))) {
        if (!waveCleared) {
            waveCleared = true;
            waveDelay = time + 1500;
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

    // Edu text fade timer
    if (eduTimer > 0) {
        eduTimer -= delta;
        if (eduTimer <= 0 && eduText) {
            scene.tweens.add({ targets: [eduText, eduBg], alpha: 0, duration: 500 });
        }
    }

    // Cleanup offscreen — use spread to snapshot the array before iterating,
    // because destroy() splices the element out of the group's internal array
    // mid-forEach, causing every other off-screen object to be skipped and
    // left alive in the physics world (accumulating ghost bodies → freeze).
    [...playerBullets.getChildren()].forEach(b => { if (b.y < -10) b.destroy(); });
    [...enemyBullets.getChildren()].forEach(b => { if (b.y > 660) b.destroy(); });
    [...powerUpGroup.getChildren()].forEach(p => { if (p.y > 660) p.destroy(); });

    // Check enemies reaching bottom
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

    // Show educational fact (not every kill - ~30% chance, or always on first kill of a wave)
    if (Phaser.Math.Between(0, 100) < 30) {
        showEduFact(scene, enemyType);
    }

    // Power-up drop chance
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
        showFloating(scene, player.x, player.y - 30, 'BLOCKED!', '#00ff00');
        updatePowerUpText();
        return;
    }
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
    if (!plyr.active || !pu.active) return;
    const scene = pu.scene;
    const type = pu.getData('type');
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
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '14px', fill: color
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
    gameOverGroup.getChildren().forEach(c => c.setVisible(true));
    const fs = gameOverGroup.getChildren().find(c => c.getData && c.getData('id') === 'finalScore');
    if (fs) fs.setText('SCORE: ' + score + '\nWAVE: ' + wave);
}

function setupMobile(scene) {
    scene.mobileLeft = false;
    scene.mobileRight = false;
    scene.mobileFire = false;
    const btnL = document.getElementById('btn-left');
    const btnR = document.getElementById('btn-right');
    const btnF = document.getElementById('btn-fire');
    if (btnL) {
        btnL.addEventListener('touchstart', (e) => { e.preventDefault(); scene.mobileLeft = true; });
        btnL.addEventListener('touchend', () => { scene.mobileLeft = false; });
    }
    if (btnR) {
        btnR.addEventListener('touchstart', (e) => { e.preventDefault(); scene.mobileRight = true; });
        btnR.addEventListener('touchend', () => { scene.mobileRight = false; });
    }
    if (btnF) {
        btnF.addEventListener('touchstart', (e) => { e.preventDefault(); scene.mobileFire = true; });
        btnF.addEventListener('touchend', () => { scene.mobileFire = false; });
    }
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
    const bg = scene.add.rectangle(240, 320, 480, 640, 0x000000, 0.88).setDepth(50);
    startGroup.add(bg);

    // SJWD Logo
    const logoBox = scene.add.rectangle(240, 110, 140, 90, 0x000000).setStrokeStyle(3, 0xffffff).setDepth(51);
    startGroup.add(logoBox);
    startGroup.add(scene.add.rectangle(240, 85, 120, 16, 0xffffff).setDepth(51));
    startGroup.add(scene.add.text(240, 108, 'SJWD', { fontFamily: 'Arial', fontSize: '24px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 138, 'WATER DISTRICT', { fontFamily: 'Arial', fontSize: '8px', fill: '#000', backgroundColor: '#fff', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 200, 'WATER BLASTER', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '20px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));
    startGroup.add(scene.add.text(240, 228, 'Purify the Supply!', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '10px', fill: '#ffffff' }).setOrigin(0.5).setDepth(51));

    startGroup.add(scene.add.text(240, 280, 'Shoot down contaminants\nbefore they reach\nthe water supply!\n\nCollect power-ups!', {
        fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '9px', fill: '#aaa', align: 'center', lineSpacing: 6
    }).setOrigin(0.5).setDepth(51));

    const legend = [
        { n: 'Lead', c: '#708090' }, { n: 'Bacteria', c: '#32cd32' },
        { n: 'Chlorine', c: '#9acd32' }, { n: 'Rust', c: '#8b4513' }
    ];
    legend.forEach((it, i) => {
        const lx = 80 + i * 100;
        startGroup.add(scene.add.circle(lx, 360, 6, Phaser.Display.Color.HexStringToColor(it.c).color).setDepth(51));
        startGroup.add(scene.add.text(lx, 374, it.n, { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '6px', fill: it.c }).setOrigin(0.5, 0).setDepth(51));
    });

    startGroup.add(scene.add.text(240, 410, 'Arrows/WASD + Space', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '9px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51));

    const btnBg = scene.add.rectangle(240, 480, 220, 50, 0x4a5568).setStrokeStyle(3, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true });
    startGroup.add(btnBg);
    const btnTxt = scene.add.text(240, 480, 'START BLASTING', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '12px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51);
    startGroup.add(btnTxt);

    btnBg.on('pointerover', () => { btnBg.setFillStyle(0x718096); btnTxt.setFill('#fff'); });
    btnBg.on('pointerout', () => { btnBg.setFillStyle(0x4a5568); btnTxt.setFill('#00bfff'); });
    btnBg.on('pointerdown', () => startPlay(scene));
    scene.input.keyboard.on('keydown-ENTER', () => { if (!gameStarted) startPlay(scene); });
}

function buildGameOverScreen(scene) {
    gameOverGroup = scene.add.group();
    const bg = scene.add.rectangle(240, 320, 480, 640, 0x000000, 0.88).setDepth(50).setVisible(false);
    gameOverGroup.add(bg);
    gameOverGroup.add(scene.add.text(240, 200, 'GAME OVER', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '28px', fill: '#ff0000' }).setOrigin(0.5).setDepth(51).setVisible(false));
    const fs = scene.add.text(240, 280, '', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '14px', fill: '#ffff00', align: 'center', lineSpacing: 8 }).setOrigin(0.5).setDepth(51).setVisible(false);
    fs.setData('id', 'finalScore');
    gameOverGroup.add(fs);

    const rBg = scene.add.rectangle(240, 380, 200, 50, 0x4a5568).setStrokeStyle(3, 0x00bfff).setDepth(51).setInteractive({ useHandCursor: true }).setVisible(false);
    gameOverGroup.add(rBg);
    const rTxt = scene.add.text(240, 380, 'PLAY AGAIN', { fontFamily: "'Press Start 2P', 'Courier New', monospace", fontSize: '12px', fill: '#00bfff' }).setOrigin(0.5).setDepth(51).setVisible(false);
    gameOverGroup.add(rTxt);
    rBg.on('pointerover', () => { rBg.setFillStyle(0x718096); rTxt.setFill('#fff'); });
    rBg.on('pointerout', () => { rBg.setFillStyle(0x4a5568); rTxt.setFill('#00bfff'); });
    rBg.on('pointerdown', () => restartPlay(scene));
    scene.input.keyboard.on('keydown-ENTER', () => { if (gameOver) restartPlay(scene); });
}

function startPlay(scene) {
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

    gameOverGroup.getChildren().forEach(c => c.setVisible(false));
    player.setVisible(true);
    player.setPosition(240, 575);

    waveDelay = player.scene.time.now + 500;
}
