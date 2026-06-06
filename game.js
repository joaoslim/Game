// ==========================================
// CONFIGURAÇÕES E ESTADOS GERAIS
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const LOGICAL_WIDTH  = 800;
const LOGICAL_HEIGHT = 600;

let gameState = 'START_SCREEN';
let score = 0;
let level = 1;
let lives = 3;
let energy = 100;
let lastTime = 0;

let player       = null;
let lasers       = [];
let enemies      = [];
let enemyLasers  = [];
let particles    = [];

// Campo de estrelas com paralaxe
const STARS = Array.from({ length: 80 }, () => ({
    x:     Math.random() * 800,
    y:     Math.random() * 600,
    size:  Math.random() * 1.8 + 0.5,
    speed: Math.random() * 0.6 + 0.2,
    alpha: Math.random() * 0.6 + 0.4
}));

const ENEMIES_PER_ROW   = 8;
let enemiesDefeatedInLevel = 0;
const totalEnemiesInLevel  = 16;
let currentEnemyRowY    = 80;
let enemyDirection      = 1;
let enemySpeedMultiplier = 1.0;
let directionFlippedThisFrame = false;

let audioCtx = null;
let joystickInputX = 0;

// ==========================================
// SPRITES (PIXEL ART EM MATRIZ)
// ==========================================

// ==========================================
// SPRITES STAR WARS (PIXEL ART)
// ==========================================

const SPRITES = {
    // Nave do jogador: X-Wing (amarelo e cinza)
    player: {
        data: [
            "....11....",
            "...1221...",
            "3.122221.3",
            "3311111133",
            "1111111111",
            "1122112211",
            "1.2....2.1",
            "..2....2.."
        ],
        palette: { "1":"#C8C8C8", "2":"#FF4500", "3":"#888888" }
    },
    // Nível 1: TIE Fighter (cinza metálico)
    hamburger: {
        data: [
            "11.....11",
            "11.222.11",
            "11.222.11",
            "111222111",
            "111222111",
            "11.222.11",
            "11.....11"
        ],
        palette: { "1":"#8899AA", "2":"#333344" }
    },
    // Nível 2: AT-AT (bege/cinza)
    cookie: {
        data: [
            "..111111..",
            ".11211211.",
            "1122112211",
            "1111111111",
            "1111111111",
            ".3..33..3.",
            ".3..33..3."
        ],
        palette: { "1":"#C8B89A", "2":"#4A4A4A", "3":"#888" }
    },
    // Nível 3: Millennium Falcon (circular, bege)
    iron: {
        data: [
            "..111111..",
            ".12333211.",
            "1233443321",
            "1234554321",
            "1234554321",
            "1233443321",
            ".12333211.",
            "..111111.."
        ],
        palette: { "1":"#AAAAAA", "2":"#888888", "3":"#666666", "4":"#444444", "5":"#222222" }
    },
    // Nível 4: Death Star (cinza com ranhura)
    bowtie: {
        data: [
            "..111111..",
            ".11111111.",
            "1111111111",
            "2222222222",
            "1111211111",
            ".11121111.",
            "..111211.."
        ],
        palette: { "1":"#999999", "2":"#444455" }
    },
    // Nível 5: Star Destroyer (triangular, cinza escuro)
    diamond: {
        data: [
            "....11....",
            "...1221...",
            "..122221..",
            ".12233221.",
            "1222222221",
            "1112222111",
            "1111111111"
        ],
        palette: { "1":"#BBBBBB", "2":"#888899", "3":"#4466AA" }
    }
};

function getEnemyTypeByLevel(lvl) {
    // Ondas em estilo Star Wars: TIE, AT-AT, Falcon, Death Star, Destroyer
    const types = ['hamburger','cookie','iron','bowtie','diamond'];
    return types[(lvl - 1) % types.length];
}

function getEnemyPointsByLevel(lvl) {
    return [20,30,40,50,60][(lvl - 1) % 5];
}

// Desenhar sprite pixel a pixel no canvas lógico
function drawPixelSprite(x, y, spriteKey, scale = 4) {
    const sprite = SPRITES[spriteKey];
    if (!sprite) return;
    const { data, palette } = sprite;
    ctx.save();
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            const ch = data[r][c];
            if (ch !== '.') {
                ctx.fillStyle = palette[ch] || '#FFF';
                ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
            }
        }
    }
    ctx.restore();
}

function getSpriteDimensions(spriteKey, scale = 4) {
    const s = SPRITES[spriteKey];
    if (!s) return { width:0, height:0 };
    return { width: s.data[0].length * scale, height: s.data.length * scale };
}

// ==========================================
// ESCALA DO CANVAS — ESSENCIAL PARA COLISÃO MOBILE
// ==========================================

// Converte coordenadas de tela (CSS pixels) para coordenadas lógicas do jogo
function screenToLogical(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (sx - rect.left) * (LOGICAL_WIDTH  / rect.width),
        y: (sy - rect.top)  * (LOGICAL_HEIGHT / rect.height)
    };
}

// ==========================================
// WEB AUDIO API — SINTETIZADOR CHIPTUNE
// ==========================================

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Som de laser estilo sabre de luz (descida suave de frequência)
function playLaserSound() {
    if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; // timbre mais agressivo
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.18);
}

// Som de disparo inimigo (mais grave)
function playEnemyLaserSound() {
    if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(280, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
}

function playExplosionSound() {
    if (!audioCtx) return;
    const dur  = 0.28;
    const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise  = audioCtx.createBufferSource();
    noise.buffer = buf;
    const filt   = audioCtx.createBiquadFilter();
    filt.type    = 'bandpass';
    filt.frequency.setValueAtTime(380, audioCtx.currentTime);
    filt.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + dur);
    filt.Q.setValueAtTime(6, audioCtx.currentTime);
    const gain   = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + dur);
    noise.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
    noise.start(); noise.stop(audioCtx.currentTime + dur);
}

function playPlayerDeathSound() {
    if (!audioCtx) return;
    const dur  = 0.75;
    const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise  = audioCtx.createBufferSource();
    noise.buffer = buf;
    const filt   = audioCtx.createBiquadFilter();
    filt.type    = 'lowpass';
    filt.frequency.setValueAtTime(600, audioCtx.currentTime);
    filt.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + dur);
    const gn = audioCtx.createGain();
    gn.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + dur);
    const osc  = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(10, audioCtx.currentTime + dur);
    const go = audioCtx.createGain();
    go.gain.setValueAtTime(0.25, audioCtx.currentTime);
    go.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + dur);
    noise.connect(filt); filt.connect(gn); gn.connect(audioCtx.destination);
    osc.connect(go); go.connect(audioCtx.destination);
    noise.start(); osc.start();
    noise.stop(audioCtx.currentTime + dur); osc.stop(audioCtx.currentTime + dur);
}

// Fanfarra de vitória — tema Star Wars (Mi-Mi-Mi-Mi-Mi-Do-Re-Mi / início)
function playLevelClearSound() {
    if (!audioCtx) return;
    const now   = audioCtx.currentTime;
    // 5 notas ascendentes ao invés de acorde simultâneo
    const melody = [329.63, 392.00, 349.23, 261.63, 392.00, 523.25];
    melody.forEach((freq, i) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.12, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.09);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now + i * 0.09); osc.stop(now + i * 0.09 + 0.10);
    });
}

// ==========================================
// INPUTS — TECLADO
// ==========================================

const keys = { left: false, right: false, space: false };

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === ' ' || e.key === 'Spacebar') { keys.space = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === ' ' || e.key === 'Spacebar') keys.space = false;
});

// ==========================================
// INPUTS — MANCHE VIRTUAL (JOYSTICK)
// ==========================================

// Detecção de dispositivo com tela de toque ou largura pequena
function checkTouchDevice() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 820);
    const mc = document.getElementById('mobileControls');
    if (isTouch) {
        mc.classList.remove('hidden');
    } else {
        mc.classList.add('hidden');
    }
}

// Desbloquear áudio iOS/Android na primeira interação direta
function unlockAudio() { initAudio(); }
document.addEventListener('pointerdown', unlockAudio, { once: true });

const joystickBase  = document.getElementById('joystickBase');
const joystickStick = document.getElementById('joystickStick');
const btnFire       = document.getElementById('btnFire');

let joystickActive = false;
let joystickOriginX = 0;        // Centro REAL da base na tela (CSS px)
const JOYSTICK_RADIUS = 38;     // Raio máximo de movimento do stick em CSS px

if (joystickBase && joystickStick) {
    joystickBase.addEventListener('pointerdown', e => {
        e.preventDefault();
        initAudio();
        joystickActive = true;
        // Ponto de origem = centro da base no momento do toque
        const rect = joystickBase.getBoundingClientRect();
        joystickOriginX = rect.left + rect.width / 2;
        joystickBase.setPointerCapture(e.pointerId);
    });

    joystickBase.addEventListener('pointermove', e => {
        if (!joystickActive) return;
        e.preventDefault();
        const dx = e.clientX - joystickOriginX;
        const clamped = Math.max(-JOYSTICK_RADIUS, Math.min(JOYSTICK_RADIUS, dx));
        joystickStick.style.transform = `translate(${clamped}px, 0px)`;
        joystickInputX = clamped / JOYSTICK_RADIUS; // -1.0 a 1.0
    });

    const releaseJoystick = e => {
        if (!joystickActive) return;
        e.preventDefault();
        joystickActive = false;
        joystickStick.style.transform = 'translate(0px, 0px)';
        joystickInputX = 0;
        try { joystickBase.releasePointerCapture(e.pointerId); } catch(_) {}
    };

    joystickBase.addEventListener('pointerup',     releaseJoystick);
    joystickBase.addEventListener('pointercancel', releaseJoystick);
}

if (btnFire) {
    btnFire.addEventListener('pointerdown', e => {
        e.preventDefault();
        keys.space = true;
        initAudio();
    });
    const releaseFire = e => { e.preventDefault(); keys.space = false; };
    btnFire.addEventListener('pointerup',     releaseFire);
    btnFire.addEventListener('pointercancel', releaseFire);
}

// ==========================================
// ENTIDADES
// ==========================================

class Player {
    constructor() {
        const d = getSpriteDimensions('player', 4);
        this.width  = d.width;
        this.height = d.height;
        this.x    = LOGICAL_WIDTH / 2 - this.width / 2;
        this.y    = LOGICAL_HEIGHT - this.height - 50;
        this.accel   = 0.55;
        this.vx      = 0;
        this.friction = 0.88;
        this.lastShotTime = 0;
        this.shootDelay   = 200;
    }

    update(dt) {
        // Prioridade: manche analógico > teclado
        if (joystickInputX !== 0) {
            this.vx += this.accel * joystickInputX * dt;
        } else {
            if (keys.left)  this.vx -= this.accel * dt;
            if (keys.right) this.vx += this.accel * dt;
        }

        // Atrito
        this.vx *= Math.pow(this.friction, dt);

        this.x += this.vx;

        // Limites
        if (this.x < 10) { this.x = 10; this.vx = 0; }
        if (this.x + this.width > LOGICAL_WIDTH - 10) {
            this.x = LOGICAL_WIDTH - 10 - this.width; this.vx = 0;
        }

        // Disparo contínuo enquanto pressionado
        if (keys.space) {
            const now = Date.now();
            if (now - this.lastShotTime > this.shootDelay) {
                this.shoot();
                this.lastShotTime = now;
            }
        }
    }

    shoot() {
        const lx = this.x + this.width / 2 - 3;
        const ly = this.y - 12;
        lasers.push(new Laser(lx, ly, this.vx));
        playLaserSound();
    }

    draw() { drawPixelSprite(this.x, this.y, 'player', 4); }
}

class Laser {
    constructor(x, y, pvx) {
        this.x = x; this.y = y;
        this.width  = 6;
        this.height = 18;
        this.speedY = 14;
        this.vx = pvx * 0.35; // herda fração da velocidade lateral do jogador
    }

    update(dt) {
        this.y -= this.speedY * dt;
        this.x += this.vx * dt;
    }

    draw() {
        ctx.save();
        // Laser dourado do X-Wing
        ctx.fillStyle   = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur  = 12;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y, type) {
        this.type = type;
        const d = getSpriteDimensions(type, 4);
        this.width  = d.width;
        this.height = d.height;
        this.x = x; this.y = y;
        this.baseSpeedX = 2.2;
        this.points     = getEnemyPointsByLevel(level);
        this.floatOffset    = Math.random() * Math.PI * 2;
        this.floatSpeed     = 0.05 + Math.random() * 0.03;
        this.floatAmplitude = 2.5;
        this.originalY = y;
    }

    update(dt, dir, mult) {
        this.x += this.baseSpeedX * dir * mult * dt;
        this.floatOffset += this.floatSpeed * dt;
        this.y = this.originalY + Math.sin(this.floatOffset) * this.floatAmplitude;
        // Disparo esporádico (máx 3 projéteis inimigos simultâneos na tela)
        if (Math.random() < 0.0006 * mult && enemyLasers.length < 3) {
            this.shoot();
        }
    }

    shoot() {
        enemyLasers.push(new EnemyLaser(this.x + this.width / 2 - 3, this.y + this.height + 4));
        playEnemyLaserSound();
    }

    draw() { drawPixelSprite(this.x, this.y, this.type, 4); }
}

class EnemyLaser {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.width  = 6;
        this.height = 14;
        this.speedY = 4.2;
    }

    update(dt) { this.y += this.speedY * dt; }

    draw() {
        ctx.save();
        // Laser vermelho do Império
        ctx.fillStyle   = '#FF3B3B';
        ctx.shadowColor = '#FF3B3B';
        ctx.shadowBlur  = 10;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.size  = Math.random() * 3 + 2;
        const ang  = Math.random() * Math.PI * 2;
        const spd  = Math.random() * 4 + 2;
        this.vx    = Math.cos(ang) * spd;
        this.vy    = Math.sin(ang) * spd;
        this.color = color;
        this.alpha = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.alpha -= this.decay * dt;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle   = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

// ==========================================
// EXPLOSÃO DE PARTÍCULAS
// ==========================================

function createExplosion(x, y, spriteKey) {
    const sprite  = SPRITES[spriteKey];
    const colors  = sprite ? Object.values(sprite.palette) : ['#FFF','#FF007F','#00FFFF'];
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y, colors[Math.floor(Math.random() * colors.length)]));
    }
}

// ==========================================
// SPAWN DE INIMIGOS
// ==========================================

function spawnEnemyRow() {
    const type  = getEnemyTypeByLevel(level);
    const dims  = getSpriteDimensions(type, 4);
    const spacing = 15;
    const totalW  = ENEMIES_PER_ROW * dims.width + (ENEMIES_PER_ROW - 1) * spacing;
    const startX  = (LOGICAL_WIDTH - totalW) / 2;
    currentEnemyRowY      = 80;
    enemies               = [];
    enemyDirection        = 1;
    directionFlippedThisFrame = false;

    for (let i = 0; i < ENEMIES_PER_ROW; i++) {
        const e = new Enemy(startX + i * (dims.width + spacing), currentEnemyRowY, type);
        e.originalY = currentEnemyRowY;
        enemies.push(e);
    }
}

// ==========================================
// COLISÃO AABB
// ==========================================

function checkAABBCollision(a, b) {
    return a.x < b.x + b.width  &&
           a.x + a.width  > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

// ==========================================
// GERENCIAMENTO DE TELAS
// ==========================================

function showScreen(id) {
    ['startScreen','gameOverScreen','gameWinScreen'].forEach(s =>
        document.getElementById(s).classList.add('hidden')
    );
    if (id) document.getElementById(id).classList.remove('hidden');
}

// ==========================================
// CONTROLE DE ESTADO DO JOGO
// ==========================================

function startGame() {
    initAudio();
    score = 0; level = 1; lives = 3; energy = 100;
    enemySpeedMultiplier   = 1.0;
    enemiesDefeatedInLevel = 0;
    lasers = []; enemies = []; enemyLasers = []; particles = [];
    player = new Player();
    spawnEnemyRow();
    gameState = 'PLAYING';
    showScreen(null);
    lastTime = performance.now();
    requestAnimationFrame(updateLoop);
}

function restartGame() { startGame(); }

function triggerPlayerDeath() {
    if (!player) return;
    playPlayerDeathSound();
    createExplosion(player.x + player.width / 2, player.y + player.height / 2, 'player');
    lives--;
    energy = 100;
    if (lives <= 0) {
        gameState = 'GAME_OVER';
        document.getElementById('finalScore').textContent = score;
        document.getElementById('finalLevel').textContent  = level;
        showScreen('gameOverScreen');
    } else {
        player = new Player();
        lasers = []; enemyLasers = [];
        spawnEnemyRow();
    }
}

function advanceLevel() {
    playLevelClearSound();
    score += Math.floor(energy * 15); // bônus de combustível restante
    level++;
    if (level > 5) {
        gameState = 'GAME_WIN';
        document.getElementById('winScore').textContent = score;
        showScreen('gameWinScreen');
        return;
    }
    enemySpeedMultiplier   = 1.0 + (level - 1) * 0.25;
    enemiesDefeatedInLevel = 0;
    energy = 100;
    lasers = []; enemyLasers = [];
    spawnEnemyRow();
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================

function updateLoop(ts) {
    if (gameState !== 'PLAYING') return;
    let dt = (ts - lastTime) / 16.666;
    if (dt > 4) dt = 4;
    lastTime = ts;
    updatePhysics(dt);
    renderGame();
    requestAnimationFrame(updateLoop);
}

// ==========================================
// FÍSICA E COLISÕES
// ==========================================

function updatePhysics(dt) {

    // 1. Player
    if (player) player.update(dt);

    // 2. Energia — drena constantemente
    energy -= (0.045 + level * 0.005) * dt;
    if (energy <= 0) {
        energy = 0;
        triggerPlayerDeath();
        return;
    }

    // 3. Lasers do player
    for (let i = lasers.length - 1; i >= 0; i--) {
        lasers[i].update(dt);
        const l = lasers[i];
        if (l.y < -20 || l.x < -20 || l.x > LOGICAL_WIDTH + 20) {
            lasers.splice(i, 1);
        }
    }

    // 4. Lasers dos inimigos
    for (let i = enemyLasers.length - 1; i >= 0; i--) {
        enemyLasers[i].update(dt);
        if (enemyLasers[i].y > LOGICAL_HEIGHT + 20) enemyLasers.splice(i, 1);
    }

    // 5. Inimigos — movimento em zigue-zague corrigido
    directionFlippedThisFrame = false;

    for (let i = 0; i < enemies.length; i++) {
        enemies[i].update(dt, enemyDirection, enemySpeedMultiplier);
    }

    // Verificar colisão com borda DEPOIS de mover todos — só inverte uma vez por frame
    if (!directionFlippedThisFrame) {
        let hitWall = false;
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (enemyDirection === 1  && (e.x + e.width) >= LOGICAL_WIDTH  - 15) { hitWall = true; break; }
            if (enemyDirection === -1 && e.x <= 15)                                { hitWall = true; break; }
        }
        if (hitWall) {
            directionFlippedThisFrame = true;
            enemyDirection *= -1;
            currentEnemyRowY += 15 + (level * 2);
            // Limitar descida: se passar de 70% da altura lógica, não desce mais
            currentEnemyRowY = Math.min(currentEnemyRowY, LOGICAL_HEIGHT * 0.70 - 60);
            for (let i = 0; i < enemies.length; i++) {
                enemies[i].originalY = currentEnemyRowY;
            }
        }
    }

    // 6. Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }

    // ==========================================
    // COLISÕES
    // ==========================================

    // Laser do player vs inimigos
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (checkAABBCollision(l, e)) {
                playExplosionSound();
                createExplosion(e.x + e.width / 2, e.y + e.height / 2, e.type);
                score += e.points;
                enemiesDefeatedInLevel++;
                enemies.splice(j, 1);
                lasers.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;
    }

    // Verificar se a fileira foi limpa
    if (enemies.length === 0) {
        if (enemiesDefeatedInLevel >= totalEnemiesInLevel) {
            advanceLevel();
        } else {
            energy = Math.min(100, energy + 30); // recarga parcial ao limpar fileira intermediária
            spawnEnemyRow();
        }
        return;
    }

    // Laser inimigo vs player
    if (player) {
        for (let i = enemyLasers.length - 1; i >= 0; i--) {
            if (checkAABBCollision(enemyLasers[i], player)) {
                enemyLasers.splice(i, 1);
                triggerPlayerDeath();
                return;
            }
        }
    }

    // Inimigo vs player (contato direto ou invasão de linha)
    if (player) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (checkAABBCollision(e, player)) { triggerPlayerDeath(); return; }
            if (e.y + e.height >= player.y)    { triggerPlayerDeath(); return; }
        }
    }
}

// ==========================================
// RENDERIZAÇÃO
// ==========================================

function renderGame() {
    // Fundo preto profundo do espaço
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Campo de estrelas com paralaxe
    for (let i = 0; i < STARS.length; i++) {
        const s = STARS[i];
        // Mover estrela para baixo (simula nave indo para frente)
        s.y += s.speed;
        if (s.y > LOGICAL_HEIGHT) {
            s.y = 0;
            s.x = Math.random() * LOGICAL_WIDTH;
        }
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle   = '#FFFFFF';
        ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // Inimigos
    enemies.forEach(e => e.draw());
    // Lasers do player
    lasers.forEach(l => l.draw());
    // Lasers dos inimigos
    enemyLasers.forEach(el => el.draw());
    // Partículas
    particles.forEach(p => p.draw());
    // Player
    if (player) player.draw();

    // ---- HUD ----

    ctx.font      = '16px "Press Start 2P"';
    ctx.textAlign = 'left';

    // Score em ouro
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`SCORE: ${score}`, 20, 35);

    // Level em azul sw
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4FC3F7';
    ctx.fillText(`LEVEL: ${level}`, LOGICAL_WIDTH - 20, 35);

    // Linha superior dourada
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(LOGICAL_WIDTH, 50); ctx.stroke();

    // Linha inferior
    ctx.strokeStyle = 'rgba(255,215,0,0.3)';
    ctx.beginPath(); ctx.moveTo(0, LOGICAL_HEIGHT - 60); ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT - 60); ctx.stroke();

    // Vidas
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('LIVES:', 20, LOGICAL_HEIGHT - 25);
    for (let i = 0; i < lives; i++) {
        drawPixelSprite(112 + i * 28, LOGICAL_HEIGHT - 40, 'player', 2);
    }

    // Barra de energia
    ctx.textAlign = 'right';
    ctx.fillStyle = '#4FC3F7';
    ctx.fillText('FORCE:', LOGICAL_WIDTH - 240, LOGICAL_HEIGHT - 25);

    const bx = LOGICAL_WIDTH - 220;
    const by = LOGICAL_HEIGHT - 40;
    const bw = 200;
    const bh = 20;

    ctx.strokeStyle = 'rgba(255,215,0,0.4)';
    ctx.lineWidth   = 3;
    ctx.strokeRect(bx, by, bw, bh);

    let barColor = '#39FF14'; // verde neon
    if (energy < 25) {
        barColor = (Math.floor(performance.now() / 150) % 2 === 0) ? '#FF3B3B' : '#330000';
    } else if (energy < 60) {
        barColor = '#FFD700'; // âmbar
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(bx + 2, by + 2, Math.max(0, (energy / 100) * bw - 4), bh - 4);
}

// ==========================================
// RESPONSIVIDADE E INICIALIZAÇÃO
// ==========================================

function resizeGame() { checkTouchDevice(); }

window.addEventListener('load', () => {
    resizeGame();
    window.addEventListener('resize', resizeGame);

    document.getElementById('startButton').addEventListener('click', () => {
        initAudio(); startGame();
    });
    document.getElementById('restartButton').addEventListener('click', () => {
        initAudio(); restartGame();
    });
    document.getElementById('winRestartButton').addEventListener('click', () => {
        initAudio(); restartGame();
    });
});
