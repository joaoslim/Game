// ==========================================
// CONFIGURAÇÕES E ESTADOS GERAIS
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Desabilitar suavização de imagem para preservar o visual pixel art nítido
ctx.imageSmoothingEnabled = false;

// Dimensões lógicas do jogo (proporção 4:3 clássica)
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 600;

// Estado do Jogo
let gameState = 'START_SCREEN'; // START_SCREEN, PLAYING, GAME_OVER, GAME_WIN
let score = 0;
let level = 1;
let lives = 3;
let energy = 100; // Porcentagem: 0 a 100
let lastTime = 0;
let joystickInputX = 0; // Controle horizontal do joystick analógico móvel

// Entidades
let player = null;
let lasers = [];
let enemies = [];
let enemyLasers = [];
let particles = [];

// Configurações do Nível
const ENEMIES_PER_ROW = 8;
let enemiesDefeatedInLevel = 0;
let totalEnemiesInLevel = 16; // 2 fileiras de 8 inimigos por fase
let currentEnemyRowY = 80;
let enemyDirection = 1; // 1 = Direita, -1 = Esquerda
let enemySpeedMultiplier = 1.0;
let timeBetweenRows = 0; // Temporizador para gerar nova fileira se a anterior foi limpa, mas ainda não completou a fase

// Audio Context (Web Audio API)
let audioCtx = null;

// ==========================================
// PALETA DE CORES E SPRITES (PIXEL ART)
// ==========================================

const SPRITES = {
    player: {
        data: [
            "....11....",
            "...1111...",
            "..113311..",
            ".11111111.",
            "1111331111",
            "1111111111",
            "1222..2221",
            "12......21"
        ],
        palette: {
            "1": "#FFFF00", // Amarelo clássico
            "2": "#FF3300", // Vermelho propulsor
            "3": "#00FFFF"  // Detalhe Ciano
        }
    },
    // Nível 1: Hambúrgueres Voadores
    hamburger: {
        data: [
            "..111111..",
            ".11111111.",
            "2222222222",
            "3333333333",
            "4444444444",
            ".11111111.",
            "..111111.."
        ],
        palette: {
            "1": "#D35400", // Pão (Laranja Escuro)
            "2": "#2ECC71", // Alface (Verde)
            "3": "#E74C3C", // Carne (Vermelho Escuro)
            "4": "#F1C40F"  // Queijo (Amarelo)
        }
    },
    // Nível 2: Bolachas / Biscoitos
    cookie: {
        data: [
            "..111111..",
            ".12111211.",
            "1111211111",
            "3333333333",
            "1112111211",
            ".11112111.",
            "..111111.."
        ],
        palette: {
            "1": "#E5A93C", // Biscoito (Marrom Claro)
            "2": "#5C3A21", // Gotas de Chocolate (Marrom Escuro)
            "3": "#FF85A2"  // Recheio (Rosa Chiclete)
        }
    },
    // Nível 3: Ferros de passar roupa
    iron: {
        data: [
            "....2222..",
            "...2....2.",
            "..2......2",
            "1111111111",
            "1113331111",
            "1113331111",
            "1111111111"
        ],
        palette: {
            "1": "#BDC3C7", // Corpo do Ferro (Cinza Aço)
            "2": "#3498DB", // Alça (Azul Elétrico)
            "3": "#E74C3C"  // Luz indicadora (Vermelho)
        }
    },
    // Nível 4: Gravatas Borboleta
    bowtie: {
        data: [
            "111....111",
            "1111..1111",
            ".11122111.",
            "..112211..",
            ".11122111.",
            "1111..1111",
            "111....111"
        ],
        palette: {
            "1": "#FF007F", // Gravata (Rosa Neon)
            "2": "#9B59B6"  // Nó central (Roxo)
        }
    },
    // Nível 5: Diamantes
    diamond: {
        data: [
            "...11...",
            "..1221..",
            ".122221.",
            "12222221",
            ".122221.",
            "..1221..",
            "...11..."
        ],
        palette: {
            "1": "#00FFFF", // Contorno (Ciano Vibrante)
            "2": "#1F85DE"  // Centro (Azul Cristal)
        }
    }
};

// Obter tipo de inimigo com base no nível
function getEnemyTypeByLevel(lvl) {
    const types = ['hamburger', 'cookie', 'iron', 'bowtie', 'diamond'];
    // Rotacionar após o nível 5 para manter o jogo infinito em níveis superiores
    const index = (lvl - 1) % types.length;
    return types[index];
}

// Obter pontos com base no nível
function getEnemyPointsByLevel(lvl) {
    const points = [20, 30, 40, 50, 60];
    const index = (lvl - 1) % points.length;
    return points[index];
}

// Função de desenho de Sprites baseados em Matriz de Pixel Art
function drawPixelSprite(x, y, spriteKey, scale = 4) {
    const sprite = SPRITES[spriteKey];
    if (!sprite) return;

    const data = sprite.data;
    const palette = sprite.palette;
    const height = data.length;
    const width = data[0].length;

    // Salvar o estado do contexto
    ctx.save();

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const char = data[r][c];
            if (char !== '.') {
                ctx.fillStyle = palette[char] || '#FFFFFF';
                // Desenhar o pixel escalado no Canvas lógico
                ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
            }
        }
    }

    ctx.restore();
}

// Retorna as dimensões físicas da sprite com base no tamanho da matriz e escala
function getSpriteDimensions(spriteKey, scale = 4) {
    const sprite = SPRITES[spriteKey];
    if (!sprite) return { width: 0, height: 0 };
    return {
        width: sprite.data[0].length * scale,
        height: sprite.data.length * scale
    };
}

// ==========================================
// SINTETIZADOR DE SONS (WEB AUDIO API)
// ==========================================

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Som de laser agudo ao disparar (Player)
function playLaserSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'triangle'; // Formato de onda retro
    osc.frequency.setValueAtTime(900, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.12);
    
    gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
}

// Som de disparo do inimigo (mais grave e curto)
function playEnemyLaserSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.18);
    
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.18);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
}

// Som de explosão "crushing" (ruído 8 bits dinâmico)
function playExplosionSound() {
    if (!audioCtx) return;
    const duration = 0.28;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Ruído branco
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    // Filtro passa-banda para dar o timbre do console retro
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(380, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + duration);
    filter.Q.setValueAtTime(6, audioCtx.currentTime);
    
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + duration);
    
    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noiseNode.start();
    noiseNode.stop(audioCtx.currentTime + duration);
}

// Som de destruição do Player
function playPlayerDeathSound() {
    if (!audioCtx) return;
    const duration = 0.75;
    
    // Ruído Explosivo
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + duration);
    
    const gainNoise = audioCtx.createGain();
    gainNoise.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gainNoise.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + duration);
    
    // Tom grave decrescente adicional para dar peso à morte
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(10, audioCtx.currentTime + duration);
    
    const gainOsc = audioCtx.createGain();
    gainOsc.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gainOsc.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + duration);
    
    noiseNode.connect(filter);
    filter.connect(gainNoise);
    gainNoise.connect(audioCtx.destination);
    
    osc.connect(gainOsc);
    gainOsc.connect(audioCtx.destination);
    
    noiseNode.start();
    osc.start();
    
    noiseNode.stop(audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
}

// Fanfarra alegre de fim de fase (Acorde maior rápido)
function playLevelClearSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 (Acorde Maior de Dó)
    const duration = 0.15;
    
    notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'square'; // Som de chiptune clássico
        osc.frequency.setValueAtTime(freq, now + index * 0.10);
        
        gainNode.gain.setValueAtTime(0.1, now + index * 0.10);
        gainNode.gain.setValueAtTime(0.1, now + index * 0.10 + 0.08);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.10 + 0.10);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(now + index * 0.10);
        osc.stop(now + index * 0.10 + duration);
    });
}

// ==========================================
// INPUTS DE CONTROLE (TECLADO & MÓVEL)
// ==========================================

const keys = {
    left: false,
    right: false,
    space: false
};

// Ouvintes de Teclado
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = true;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = true;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
        keys.space = true;
        e.preventDefault(); // Evitar scroll de tela
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keys.left = false;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keys.right = false;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
        keys.space = false;
    }
});

// Detecção de Dispositivos Móveis/Touch e Telas Estreitas
function checkTouchDevice() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 820);
    const mobileControls = document.getElementById('mobileControls');
    
    if (isTouch) {
        mobileControls.classList.remove('hidden');
        document.querySelector('.mobile-note').style.display = 'block';
    } else {
        mobileControls.classList.add('hidden');
        document.querySelector('.mobile-note').style.display = 'none';
    }
}

// Desbloquear contexto de áudio em qualquer interação na página (mobile)
window.addEventListener('click', initAudio, { once: true });
window.addEventListener('touchstart', initAudio, { once: true });

// Ouvintes do Manche Virtual (Joystick) e do Botão de Disparo
const joystickBase = document.getElementById('joystickBase');
const joystickStick = document.getElementById('joystickStick');
const btnFire = document.getElementById('btnFire');

let joystickActive = false;
let joystickStartX = 0;
const joystickMaxRadius = 40; // Pixels máximos de deslocamento do manche

if (joystickBase && joystickStick) {
    joystickBase.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        initAudio();
        joystickActive = true;
        joystickStartX = e.clientX;
        joystickBase.setPointerCapture(e.pointerId);
    });

    joystickBase.addEventListener('pointermove', (e) => {
        if (!joystickActive) return;
        e.preventDefault();
        const dx = e.clientX - joystickStartX;
        
        // Limitar deslocamento ao raio do manche
        const limitedDx = Math.max(-joystickMaxRadius, Math.min(joystickMaxRadius, dx));
        
        // Mover visualmente o manche apenas na horizontal
        joystickStick.style.transform = `translate(${limitedDx}px, 0px)`;
        
        // Calcular o valor de entrada normalizado (-1.0 a 1.0)
        joystickInputX = limitedDx / joystickMaxRadius;
    });

    const endJoystick = (e) => {
        if (!joystickActive) return;
        e.preventDefault();
        joystickActive = false;
        joystickStick.style.transform = 'translate(0px, 0px)';
        joystickInputX = 0;
        try {
            joystickBase.releasePointerCapture(e.pointerId);
        } catch (err) {}
    };

    joystickBase.addEventListener('pointerup', endJoystick);
    joystickBase.addEventListener('pointercancel', endJoystick);
}

if (btnFire) {
    btnFire.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        keys.space = true;
        initAudio();
    });
    
    const endFire = (e) => {
        e.preventDefault();
        keys.space = false;
    };
    
    btnFire.addEventListener('pointerup', endFire);
    btnFire.addEventListener('pointercancel', endFire);
}

// ==========================================
// ENTIDADES DO JOGO
// ==========================================

// Classe Player
class Player {
    constructor() {
        const dims = getSpriteDimensions('player', 4);
        this.width = dims.width;
        this.height = dims.height;
        this.x = LOGICAL_WIDTH / 2 - this.width / 2;
        this.y = LOGICAL_HEIGHT - this.height - 50; // Posicionado acima da barra de energia
        this.speed = 0.55; // Velocidade de aceleração
        this.vx = 0;      // Velocidade horizontal atual
        this.friction = 0.88; // Fricção para parada suave
        this.lastShotTime = 0;
        this.shootDelay = 180; // Tempo em ms entre disparos (tiros rápidos)
    }

    update(deltaTime) {
        // Movimentação com física/aceleração (analógico móvel ou teclado)
        if (joystickInputX !== 0) {
            this.vx += this.speed * joystickInputX * deltaTime;
        } else {
            if (keys.left) {
                this.vx -= this.speed * deltaTime;
            }
            if (keys.right) {
                this.vx += this.speed * deltaTime;
            }
        }

        // Aplicar atrito/desaceleração
        this.vx *= Math.pow(this.friction, deltaTime);

        this.x += this.vx;

        // Limites de tela lógicos
        if (this.x < 10) {
            this.x = 10;
            this.vx = 0;
        }
        if (this.x + this.width > LOGICAL_WIDTH - 10) {
            this.x = LOGICAL_WIDTH - 10 - this.width;
            this.vx = 0;
        }

        // Disparo automático/manual rápido se a barra de espaço estiver pressionada
        if (keys.space) {
            const now = Date.now();
            if (now - this.lastShotTime > this.shootDelay) {
                this.shoot();
                this.lastShotTime = now;
            }
        }
    }

    shoot() {
        // Criação do laser saindo do centro da nave
        const laserX = this.x + this.width / 2 - 3;
        const laserY = this.y - 12;
        lasers.push(new Laser(laserX, laserY, this.vx));
        playLaserSound();
    }

    draw() {
        drawPixelSprite(this.x, this.y, 'player', 4);
    }
}

// Classe Laser (Projétil do Player)
class Laser {
    constructor(x, y, playerVx) {
        this.x = x;
        this.y = y;
        this.width = 6;
        this.height = 18;
        this.speedY = 13.5; // Projéteis rápidos
        // Controle guiado do laser clássico do Megamania:
        // O projétil herda uma fração da velocidade lateral do jogador
        this.vx = playerVx * 0.38;
    }

    update(deltaTime) {
        this.y -= this.speedY * deltaTime;
        this.x += this.vx * deltaTime;
    }

    draw() {
        // Desenha laser com efeito de brilho neon rosa brilhante
        ctx.save();
        ctx.fillStyle = '#FF007F';
        ctx.shadowColor = '#FF007F';
        ctx.shadowBlur = 8;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

// Classe Enemy (Inimigos)
class Enemy {
    constructor(x, y, type) {
        this.type = type;
        const dims = getSpriteDimensions(type, 4);
        this.width = dims.width;
        this.height = dims.height;
        this.x = x;
        this.y = y;
        // Padrão de velocidade de zigue-zague
        this.baseSpeedX = 2.2;
        this.points = getEnemyPointsByLevel(level);
        
        // Efeito visual de animação simples de flutuação vertical individual
        this.floatOffset = Math.random() * Math.PI * 2;
        this.floatSpeed = 0.05 + Math.random() * 0.03;
        this.floatAmplitude = 2.5;
        this.originalY = y;
    }

    update(deltaTime, dir, levelMult) {
        // Movimentação horizontal em grupo ditada pela direção do grupo e multiplicador
        this.x += this.baseSpeedX * dir * levelMult * deltaTime;
        
        // Oscilação vertical sutil para parecer flutuação orgânica
        this.floatOffset += this.floatSpeed * deltaTime;
        this.y = this.originalY + Math.sin(this.floatOffset) * this.floatAmplitude;

        // Decisão de disparo aleatório (baixa probabilidade por frame para evitar spam)
        // Aumenta ligeiramente a chance conforme o multiplicador do nível
        if (Math.random() < 0.0006 * levelMult && enemyLasers.length < 3) {
            this.shoot();
        }
    }

    shoot() {
        const laserX = this.x + this.width / 2 - 3;
        const laserY = this.y + this.height + 4;
        enemyLasers.push(new EnemyLaser(laserX, laserY));
        playEnemyLaserSound();
    }

    draw() {
        drawPixelSprite(this.x, this.y, this.type, 4);
    }
}

// Classe EnemyLaser (Projétil dos Inimigos)
class EnemyLaser {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 6;
        this.height = 14;
        this.speedY = 4.2; // Projéteis inimigos mais lentos e desviáveis
    }

    update(deltaTime) {
        this.y += this.speedY * deltaTime;
    }

    draw() {
        // Laser inimigo verde neon brilhante
        ctx.save();
        ctx.fillStyle = '#00FF00';
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 8;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

// Classe Particle (Partículas de explosão premium)
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = color;
        this.alpha = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.alpha -= this.decay * deltaTime;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

// ==========================================
// SISTEMA DE PARTÍCULAS
// ==========================================

function createExplosion(x, y, spriteKey) {
    const sprite = SPRITES[spriteKey];
    const colors = sprite ? Object.values(sprite.palette) : ['#FFFFFF', '#FF007F', '#00FFFF'];
    
    // Gerar 15 a 20 partículas
    const count = 18;
    for (let i = 0; i < count; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(x, y, color));
    }
}

// ==========================================
// LÓGICA DE SPAWN DOS INIMIGOS E ONDAS
// ==========================================

function spawnEnemyRow() {
    const type = getEnemyTypeByLevel(level);
    const dims = getSpriteDimensions(type, 4);
    const spacing = 15;
    const totalRowWidth = (ENEMIES_PER_ROW * dims.width) + ((ENEMIES_PER_ROW - 1) * spacing);
    
    // Centralizar a linha de inimigos no início
    const startX = (LOGICAL_WIDTH - totalRowWidth) / 2;
    currentEnemyRowY = 80;
    
    enemies = [];
    enemyDirection = 1;

    for (let i = 0; i < ENEMIES_PER_ROW; i++) {
        const enemyX = startX + i * (dims.width + spacing);
        const enemyY = currentEnemyRowY;
        const enemy = new Enemy(enemyX, enemyY, type);
        // Ajustar originalY para controle de flutuação
        enemy.originalY = enemyY;
        enemies.push(enemy);
    }
}

// ==========================================
// FUNÇÕES DE COLISÃO
// ==========================================

function checkAABBCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// ==========================================
// LOOP DE JOGO E CONTROLES DE ESTADO
// ==========================================

function showScreen(screenId) {
    // Esconder todas as telas overlay
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('gameWinScreen').classList.add('hidden');

    // Mostrar a tela desejada se informada
    if (screenId) {
        document.getElementById(screenId).classList.remove('hidden');
    }
}

function startGame() {
    initAudio();
    score = 0;
    level = 1;
    lives = 3;
    energy = 100;
    enemySpeedMultiplier = 1.0;
    enemiesDefeatedInLevel = 0;
    
    lasers = [];
    enemies = [];
    enemyLasers = [];
    particles = [];
    
    player = new Player();
    
    spawnEnemyRow();
    
    gameState = 'PLAYING';
    showScreen(null);
    lastTime = performance.now();
    requestAnimationFrame(updateLoop);
}

function restartGame() {
    startGame();
}

function triggerPlayerDeath() {
    playPlayerDeathSound();
    createExplosion(player.x + player.width / 2, player.y + player.height / 2, 'player');
    
    lives--;
    energy = 100; // Resetar energia ao morrer
    
    if (lives <= 0) {
        gameState = 'GAME_OVER';
        document.getElementById('finalScore').textContent = score;
        document.getElementById('finalLevel').textContent = level;
        showScreen('gameOverScreen');
    } else {
        // Resetar posições
        player = new Player();
        lasers = [];
        enemyLasers = [];
        // Reposicionar a linha de inimigos no topo
        spawnEnemyRow();
    }
}

function advanceLevel() {
    playLevelClearSound();
    
    // Somar pontos bônus equivalentes ao combustível/energia restante
    const energyBonus = Math.floor(energy * 15);
    score += energyBonus;
    
    level++;
    
    // Se passarmos do nível 5, o jogador vence!
    if (level > 5) {
        gameState = 'GAME_WIN';
        document.getElementById('winScore').textContent = score;
        showScreen('gameWinScreen');
        return;
    }
    
    // Atualizar multiplicadores de velocidade
    enemySpeedMultiplier = 1.0 + (level - 1) * 0.25;
    
    // Resetar variáveis de onda
    enemiesDefeatedInLevel = 0;
    energy = 100;
    lasers = [];
    enemyLasers = [];
    
    spawnEnemyRow();
}

// ==========================================
// LOOP DE ATUALIZAÇÃO E RENDERIZAÇÃO
// ==========================================

function updateLoop(timestamp) {
    if (gameState !== 'PLAYING') return;

    // Calcular Delta Time para movimentação fluida e independente da taxa de quadros (framerate)
    let deltaTime = (timestamp - lastTime) / 16.666; // Normalizado em torno de 60fps (16.67ms)
    
    // Evitar saltos gigantes em deltaTime se o jogo for minimizado ou perder foco
    if (deltaTime > 4) deltaTime = 4;
    lastTime = timestamp;

    updatePhysics(deltaTime);
    renderGame();

    requestAnimationFrame(updateLoop);
}

function updatePhysics(deltaTime) {
    // 1. Atualizar Player
    if (player) {
        player.update(deltaTime);
    }

    // 2. Barra de Combustível / Energia
    // Drena energia gradualmente. A taxa aumenta ligeiramente a cada nível.
    const drainRate = (0.045 + (level * 0.005)) * deltaTime;
    energy -= drainRate;
    if (energy <= 0) {
        energy = 0;
        triggerPlayerDeath();
        return;
    }

    // 3. Atualizar Lasers do Player
    for (let i = lasers.length - 1; i >= 0; i--) {
        lasers[i].update(deltaTime);
        // Remover lasers fora da tela
        if (lasers[i].y < -20 || lasers[i].x < -20 || lasers[i].x > LOGICAL_WIDTH + 20) {
            lasers.splice(i, 1);
        }
    }

    // 4. Atualizar Lasers dos Inimigos
    for (let i = enemyLasers.length - 1; i >= 0; i--) {
        enemyLasers[i].update(deltaTime);
        if (enemyLasers[i].y > LOGICAL_HEIGHT + 20) {
            enemyLasers.splice(i, 1);
        }
    }

    // 5. Atualizar Inimigos (Zigue-zague e descida)
    let touchBorder = false;
    for (let i = 0; i < enemies.length; i++) {
        enemies[i].update(deltaTime, enemyDirection, enemySpeedMultiplier);
        
        // Verificar se tocou a borda lógica
        if (enemyDirection === 1 && (enemies[i].x + enemies[i].width) >= LOGICAL_WIDTH - 15) {
            touchBorder = true;
        } else if (enemyDirection === -1 && enemies[i].x <= 15) {
            touchBorder = true;
        }
    }

    // Se qualquer inimigo bater na parede, inverte a direção de todos e desce a linha
    if (touchBorder) {
        enemyDirection *= -1;
        currentEnemyRowY += 15 + (level * 2); // Inimigos descem um pouco mais rápido nos níveis superiores
        
        // Empurrar todos os inimigos verticalmente para a nova linha lógica
        for (let i = 0; i < enemies.length; i++) {
            enemies[i].originalY = currentEnemyRowY;
        }
    }

    // 6. Atualizar Partículas
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(deltaTime);
        if (particles[i].alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    // ==========================================
    // VERIFICAÇÃO DE COLISÕES
    // ==========================================

    // Colisão: Laser do Player vs Inimigos
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
                
                // Remover inimigo e laser
                enemies.splice(j, 1);
                lasers.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;
    }

    // Verificar se a fileira atual de inimigos foi limpa
    if (enemies.length === 0) {
        if (enemiesDefeatedInLevel >= totalEnemiesInLevel) {
            // Avança para o próximo nível
            advanceLevel();
        } else {
            // Se ainda faltam inimigos para completar a cota do nível, gera mais uma fileira no topo
            energy = Math.min(100, energy + 30); // Ganha recarga parcial ao limpar a fileira intermediária
            spawnEnemyRow();
        }
    }

    // Colisão: Laser dos Inimigos vs Player
    if (player) {
        for (let i = enemyLasers.length - 1; i >= 0; i--) {
            const el = enemyLasers[i];
            if (checkAABBCollision(el, player)) {
                enemyLasers.splice(i, 1);
                triggerPlayerDeath();
                return;
            }
        }
    }

    // Colisão: Inimigo vs Player (Contato Direto)
    if (player) {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (checkAABBCollision(e, player)) {
                triggerPlayerDeath();
                return;
            }
            
            // Se o inimigo descer demais e passar da linha do jogador, ele explode e o jogador perde a vida
            if (e.y + e.height >= player.y + player.height) {
                triggerPlayerDeath();
                return;
            }
        }
    }
}

function renderGame() {
    // Limpar o Canvas com fundo preto sólido clássico do Atari
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Efeito sutil de estrelas de fundo de chiptune clássico (estrelas estáticas que piscam)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let i = 0; i < 40; i++) {
        // Posicionamento pseudo-aleatório baseado no índice
        const x = (i * 73) % LOGICAL_WIDTH;
        const y = (i * 109) % (LOGICAL_HEIGHT - 60);
        // Piscar leve
        if ((Math.floor(performance.now() / 250) + i) % 7 !== 0) {
            ctx.fillRect(x, y, 2, 2);
        }
    }

    // 1. Desenhar Inimigos
    for (let i = 0; i < enemies.length; i++) {
        enemies[i].draw();
    }

    // 2. Desenhar Lasers do Jogador
    for (let i = 0; i < lasers.length; i++) {
        lasers[i].draw();
    }

    // 3. Desenhar Lasers dos Inimigos
    for (let i = 0; i < enemyLasers.length; i++) {
        enemyLasers[i].draw();
    }

    // 4. Desenhar Partículas
    for (let i = 0; i < particles.length; i++) {
        particles[i].draw();
    }

    // 5. Desenhar Jogador
    if (player) {
        player.draw();
    }

    // ==========================================
    // DESENHAR INTERFACE (UI) NO CANVAS
    // ==========================================

    // HUD Superior: Pontuação e Nível
    ctx.font = '16px "Press Start 2P"';
    ctx.textAlign = 'left';
    
    // Desenhar Placar em Amarelo brilhante
    ctx.fillStyle = '#FFFF00';
    ctx.fillText(`SCORE: ${score}`, 20, 35);

    // Desenhar Nível no Canto Direito
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText(`LEVEL: ${level}`, LOGICAL_WIDTH - 20, 35);

    // Linha divisória superior fina
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(LOGICAL_WIDTH, 50);
    ctx.stroke();

    // HUD Inferior: Vidas e Barra de Energia
    // Linha divisória inferior fina
    ctx.beginPath();
    ctx.moveTo(0, LOGICAL_HEIGHT - 60);
    ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT - 60);
    ctx.stroke();

    // Desenhar Ícones de Vidas (Pequenas naves)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('LIVES:', 20, LOGICAL_HEIGHT - 25);
    
    for (let i = 0; i < lives; i++) {
        // Desenha pequenas naves amarelas ao lado do texto de vidas
        const lifeX = 110 + i * 28;
        const lifeY = LOGICAL_HEIGHT - 40;
        drawPixelSprite(lifeX, lifeY, 'player', 2); // Escala 2 para ficar menor
    }

    // Desenhar Barra de Energia / Combustível
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FF007F';
    ctx.fillText('ENERGY:', LOGICAL_WIDTH - 240, LOGICAL_HEIGHT - 25);

    const barX = LOGICAL_WIDTH - 220;
    const barY = LOGICAL_HEIGHT - 40;
    const barWidth = 200;
    const barHeight = 20;

    // Contorno da barra (cinza)
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 3;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Preenchimento da Barra (Mudança de cor baseada no nível de energia: Verde -> Amarelo -> Vermelho)
    let barColor = '#00FF00'; // Verde
    if (energy < 25) {
        barColor = '#FF0000'; // Vermelho piscante se muito baixo
        if (Math.floor(performance.now() / 150) % 2 === 0) {
            barColor = '#330000';
        }
    } else if (energy < 60) {
        barColor = '#FFFF00'; // Amarelo
    }

    ctx.fillStyle = barColor;
    const fillWidth = (energy / 100) * barWidth;
    ctx.fillRect(barX + 2, barY + 2, Math.max(0, fillWidth - 4), barHeight - 4);
}

// ==========================================
// ADAPTAÇÃO MOBILE E AJUSTE DE ASPECTO
// ==========================================

function resizeGame() {
    // A adaptação de CSS usando `aspect-ratio` cuida do redimensionamento do canvas na tela.
    // No entanto, precisamos assegurar que os eventos de clique sejam precisos e
    // que o tamanho real do layout do container respeite os limites lógicos.
    checkTouchDevice();
}

// ==========================================
// INICIALIZAÇÃO E BINDINGS DE TELA
// ==========================================

window.addEventListener('load', () => {
    resizeGame();
    window.addEventListener('resize', resizeGame);
    
    // Botão de Iniciar Jogo
    document.getElementById('startButton').addEventListener('click', () => {
        startGame();
    });

    // Botões de Reiniciar Jogo (Telas GameOver e Win)
    document.getElementById('restartButton').addEventListener('click', () => {
        restartGame();
    });

    document.getElementById('winRestartButton').addEventListener('click', () => {
        restartGame();
    });
});
