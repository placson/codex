const { GAME_CONFIG } = require("./config");

const COLORS = ["#5cc8ff", "#ffd166", "#95e06c", "#ff8fab"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (!length) {
    return { x: 0, y: 0 };
  }

  return { x: x / length, y: y / length };
}

function randomEdgeSpawn() {
  const side = Math.floor(Math.random() * 4);

  if (side === 0) {
    return { x: Math.random() * GAME_CONFIG.mapWidth, y: -GAME_CONFIG.alienRadius };
  }
  if (side === 1) {
    return {
      x: GAME_CONFIG.mapWidth + GAME_CONFIG.alienRadius,
      y: Math.random() * GAME_CONFIG.mapHeight
    };
  }
  if (side === 2) {
    return {
      x: Math.random() * GAME_CONFIG.mapWidth,
      y: GAME_CONFIG.mapHeight + GAME_CONFIG.alienRadius
    };
  }

  return { x: -GAME_CONFIG.alienRadius, y: Math.random() * GAME_CONFIG.mapHeight };
}

class GameRoom {
  constructor(id, io) {
    this.id = id;
    this.io = io;
    this.players = new Map();
    this.bullets = new Map();
    this.aliens = new Map();
    this.score = 0;
    this.wave = 0;
    this.waveInProgress = false;
    this.gameOver = false;
    this.gameOverRecorded = false;
    this.lastWaveAt = 0;
    this.nextBulletId = 1;
    this.nextAlienId = 1;
  }

  getPlayerCount() {
    return this.players.size;
  }

  hasCapacity() {
    return this.getPlayerCount() < GAME_CONFIG.maxPlayersPerRoom;
  }

  isJoinable() {
    return this.hasCapacity() && !this.gameOver;
  }

  addPlayer(socket, name) {
    const spawnX = GAME_CONFIG.mapWidth / 2 + (Math.random() * 120 - 60);
    const spawnY = GAME_CONFIG.mapHeight / 2 + (Math.random() * 120 - 60);

    const player = {
      id: socket.id,
      name,
      x: spawnX,
      y: spawnY,
      aimAngle: 0,
      input: { up: false, down: false, left: false, right: false, aimAngle: 0 },
      color: COLORS[this.players.size % COLORS.length],
      health: GAME_CONFIG.playerMaxHealth,
      alive: true,
      lastShotAt: 0
    };

    this.players.set(socket.id, player);
    socket.join(this.id);
    socket.data.roomId = this.id;
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  setInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player || !player.alive || this.gameOver) {
      return;
    }

    player.input = {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right,
      aimAngle: typeof input.aimAngle === "number" ? input.aimAngle : player.aimAngle
    };
    player.aimAngle = player.input.aimAngle;
  }

  spawnBullet(playerId) {
    const player = this.players.get(playerId);
    const now = Date.now();

    if (!player || !player.alive || this.gameOver) {
      return;
    }

    if (now - player.lastShotAt < GAME_CONFIG.shootCooldownMs) {
      return;
    }

    player.lastShotAt = now;
    const direction = {
      x: Math.cos(player.aimAngle),
      y: Math.sin(player.aimAngle)
    };
    const id = `b${this.nextBulletId++}`;
    const muzzleOffset = GAME_CONFIG.playerRadius + GAME_CONFIG.bulletRadius + 2;

    this.bullets.set(id, {
      id,
      ownerId: player.id,
      x: player.x + direction.x * muzzleOffset,
      y: player.y + direction.y * muzzleOffset,
      vx: direction.x * GAME_CONFIG.bulletSpeed,
      vy: direction.y * GAME_CONFIG.bulletSpeed,
      damage: GAME_CONFIG.bulletDamage,
      createdAt: now
    });
  }

  update(deltaMs) {
    // The server owns the full simulation so clients only send intent and render snapshots.
    this.updatePlayers(deltaMs);
    this.maybeSpawnWave();
    this.updateAliens(deltaMs);
    this.updateBullets(deltaMs);
    this.checkGameOver();
  }

  updatePlayers(deltaMs) {
    const step = deltaMs / 1000;

    for (const player of this.players.values()) {
      if (!player.alive) {
        continue;
      }

      const horizontal = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
      const vertical = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
      const direction = normalizeVector(horizontal, vertical);

      player.x = clamp(
        player.x + direction.x * GAME_CONFIG.playerSpeed * step,
        GAME_CONFIG.playerRadius,
        GAME_CONFIG.mapWidth - GAME_CONFIG.playerRadius
      );
      player.y = clamp(
        player.y + direction.y * GAME_CONFIG.playerSpeed * step,
        GAME_CONFIG.playerRadius,
        GAME_CONFIG.mapHeight - GAME_CONFIG.playerRadius
      );
    }
  }

  maybeSpawnWave() {
    const now = Date.now();
    const activeAliens = this.aliens.size;
    const enoughPlayers = this.getPlayerCount() >= 1;

    if (!enoughPlayers || this.gameOver || activeAliens > 0 || now - this.lastWaveAt < GAME_CONFIG.waveIntervalMs) {
      return;
    }

    this.wave += 1;
    this.lastWaveAt = now;
    this.waveInProgress = true;

    // Scale wave size and difficulty with progression and surviving teammates.
    const livingPlayers = [...this.players.values()].filter((player) => player.alive).length || 1;
    const totalToSpawn = GAME_CONFIG.maxAliensPerWaveBase + this.wave * 2 + livingPlayers;
    const health = GAME_CONFIG.alienHealthBase + this.wave * 8;
    const speed = GAME_CONFIG.alienSpeedBase + this.wave * 5;

    for (let i = 0; i < totalToSpawn; i += 1) {
      const spawn = randomEdgeSpawn();
      const id = `a${this.nextAlienId++}`;

      this.aliens.set(id, {
        id,
        x: spawn.x,
        y: spawn.y,
        health,
        maxHealth: health,
        radius: GAME_CONFIG.alienRadius,
        speed,
        lastAttackAt: 0
      });
    }
  }

  updateAliens(deltaMs) {
    const step = deltaMs / 1000;
    const livingPlayers = [...this.players.values()].filter((player) => player.alive);

    if (!livingPlayers.length) {
      return;
    }

    for (const alien of this.aliens.values()) {
      let nearestPlayer = livingPlayers[0];
      let nearestDistance = distanceSquared(alien, nearestPlayer);

      for (let i = 1; i < livingPlayers.length; i += 1) {
        const player = livingPlayers[i];
        const dist = distanceSquared(alien, player);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestPlayer = player;
        }
      }

      const direction = normalizeVector(nearestPlayer.x - alien.x, nearestPlayer.y - alien.y);
      alien.x += direction.x * alien.speed * step;
      alien.y += direction.y * alien.speed * step;

      const collisionDistance = GAME_CONFIG.playerRadius + alien.radius;
      if (distanceSquared(alien, nearestPlayer) <= collisionDistance * collisionDistance) {
        const now = Date.now();
        if (now - alien.lastAttackAt >= GAME_CONFIG.alienContactCooldownMs) {
          alien.lastAttackAt = now;
          nearestPlayer.health = Math.max(0, nearestPlayer.health - GAME_CONFIG.alienTouchDamage);
          if (nearestPlayer.health === 0) {
            nearestPlayer.alive = false;
          }
        }
      }
    }

    if (this.waveInProgress && this.aliens.size === 0) {
      this.waveInProgress = false;
    }
  }

  updateBullets(deltaMs) {
    const step = deltaMs / 1000;
    const now = Date.now();
    const bulletsToRemove = [];
    const aliensToRemove = [];

    for (const bullet of this.bullets.values()) {
      bullet.x += bullet.vx * step;
      bullet.y += bullet.vy * step;

      const expired = now - bullet.createdAt > GAME_CONFIG.bulletLifetimeMs;
      const outOfBounds =
        bullet.x < -GAME_CONFIG.bulletRadius ||
        bullet.x > GAME_CONFIG.mapWidth + GAME_CONFIG.bulletRadius ||
        bullet.y < -GAME_CONFIG.bulletRadius ||
        bullet.y > GAME_CONFIG.mapHeight + GAME_CONFIG.bulletRadius;

      if (expired || outOfBounds) {
        bulletsToRemove.push(bullet.id);
        continue;
      }

      // Collision resolution stays server-side to keep damage and score authoritative.
      for (const alien of this.aliens.values()) {
        const hitDistance = GAME_CONFIG.bulletRadius + alien.radius;
        if (distanceSquared(bullet, alien) <= hitDistance * hitDistance) {
          alien.health -= bullet.damage;
          bulletsToRemove.push(bullet.id);

          if (alien.health <= 0) {
            aliensToRemove.push(alien.id);
            this.score += 10;
          }
          break;
        }
      }
    }

    for (const bulletId of bulletsToRemove) {
      this.bullets.delete(bulletId);
    }
    for (const alienId of aliensToRemove) {
      this.aliens.delete(alienId);
    }

    if (this.waveInProgress && this.aliens.size === 0) {
      this.waveInProgress = false;
    }
  }

  checkGameOver() {
    if (!this.players.size || this.gameOver) {
      return;
    }

    const hasLivingPlayer = [...this.players.values()].some((player) => player.alive);
    if (!hasLivingPlayer) {
      this.gameOver = true;
    }
  }

  consumeFinishedRun() {
    if (!this.gameOver || this.gameOverRecorded) {
      return null;
    }

    this.gameOverRecorded = true;
    return {
      roomId: this.id,
      score: this.score,
      wave: this.wave,
      players: [...this.players.values()].map((player) => player.name),
      finishedAt: new Date().toISOString()
    };
  }

  createSnapshot() {
    return {
      roomId: this.id,
      map: {
        width: GAME_CONFIG.mapWidth,
        height: GAME_CONFIG.mapHeight
      },
      score: this.score,
      wave: this.wave,
      gameOver: this.gameOver,
      playerCount: this.getPlayerCount(),
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        x: player.x,
        y: player.y,
        aimAngle: player.aimAngle,
        color: player.color,
        health: player.health,
        alive: player.alive
      })),
      bullets: [...this.bullets.values()].map((bullet) => ({
        id: bullet.id,
        x: bullet.x,
        y: bullet.y
      })),
      aliens: [...this.aliens.values()].map((alien) => ({
        id: alien.id,
        x: alien.x,
        y: alien.y,
        health: alien.health,
        maxHealth: alien.maxHealth,
        radius: alien.radius
      }))
    };
  }
}

module.exports = { GameRoom };
