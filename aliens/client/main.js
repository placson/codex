const socket = io();

const overlay = document.getElementById("overlay");
const joinButton = document.getElementById("joinButton");
const nameInput = document.getElementById("nameInput");
const roomStatus = document.getElementById("roomStatus");
const roomsContainer = document.getElementById("rooms");
const highScoresContainer = document.getElementById("highScores");
const shareBox = document.getElementById("shareBox");
const roomLabel = document.getElementById("roomLabel");
const playerCountLabel = document.getElementById("playerCountLabel");
const healthLabel = document.getElementById("healthLabel");
const healthBarFill = document.getElementById("healthBarFill");
const scoreLabel = document.getElementById("scoreLabel");
const waveLabel = document.getElementById("waveLabel");

const renderState = {
  playerId: null,
  playerName: "",
  snapshot: null
};

const sceneState = {
  players: new Map(),
  bullets: new Map(),
  aliens: new Map(),
  cursors: null,
  keys: null,
  fireKey: null
};

function isTypingInField() {
  return document.activeElement === nameInput;
}

function getDisplayName(name, fallback = "Pilot") {
  if (typeof name !== "string") {
    return fallback;
  }

  const trimmed = name.trim();
  return trimmed || fallback;
}

class CoopScene extends Phaser.Scene {
  constructor() {
    super("coop-scene");
  }

  create() {
    this.add.rectangle(700, 450, 1400, 900, 0x102038);
    this.drawGrid();

    sceneState.cursors = this.input.keyboard.createCursorKeys();
    sceneState.keys = this.input.keyboard.addKeys("W,A,S,D");
    sceneState.fireKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.disableGlobalCapture();

    this.input.on("pointerdown", () => {
      if (renderState.playerId) {
        socket.emit("shoot");
      }
    });

    sceneState.fireKey.on("down", () => {
      if (renderState.playerId && !isTypingInField()) {
        socket.emit("shoot");
      }
    });
  }

  drawGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x163150, 0.8);

    for (let x = 0; x <= 1400; x += 70) {
      graphics.lineBetween(x, 0, x, 900);
    }
    for (let y = 0; y <= 900; y += 70) {
      graphics.lineBetween(0, y, 1400, y);
    }
  }

  update() {
    this.sendInput();
    this.renderSnapshot();
  }

  sendInput() {
    if (!renderState.playerId || !renderState.snapshot || renderState.snapshot.gameOver || isTypingInField()) {
      return;
    }

    const pointer = this.input.activePointer;
    const localPlayer = renderState.snapshot.players.find((player) => player.id === renderState.playerId);
    const aimAngle = localPlayer
      ? Phaser.Math.Angle.Between(localPlayer.x, localPlayer.y, pointer.worldX, pointer.worldY)
      : 0;

    socket.emit("player-input", {
      up: sceneState.keys.W.isDown || sceneState.cursors.up.isDown,
      down: sceneState.keys.S.isDown || sceneState.cursors.down.isDown,
      left: sceneState.keys.A.isDown || sceneState.cursors.left.isDown,
      right: sceneState.keys.D.isDown || sceneState.cursors.right.isDown,
      aimAngle
    });
  }

  renderSnapshot() {
    const snapshot = renderState.snapshot;
    if (!snapshot) {
      return;
    }

    syncEntityMap(this, sceneState.players, snapshot.players, drawPlayer);
    syncEntityMap(this, sceneState.bullets, snapshot.bullets, drawBullet);
    syncEntityMap(this, sceneState.aliens, snapshot.aliens, drawAlien);
  }
}

function drawPlayer(scene, entity, sprite) {
  const displayName = getDisplayName(entity.name);

  if (!sprite) {
    sprite = scene.add.container(entity.x, entity.y);
    const base = scene.add.container(0, 0);
    const body = scene.add.circle(0, 0, 18, Phaser.Display.Color.HexStringToColor(entity.color).color);
    const barrel = scene.add.rectangle(16, 0, 20, 6, 0xf8fafc);
    const healthBarBg = scene.add.rectangle(0, -28, 42, 6, 0x172033);
    const healthBar = scene.add.rectangle(-21, -28, 42, 6, 0x22c55e).setOrigin(0, 0.5);
    const nameText = scene.add
      .text(0, -48, displayName, {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "13px",
        color: "#edf4ff",
        stroke: "#08111f",
        strokeThickness: 4
      })
      .setOrigin(0.5);

    base.add([body, barrel]);
    sprite.add([nameText, healthBarBg, healthBar, base]);
    sprite.base = base;
    sprite.healthBar = healthBar;
    sprite.nameText = nameText;
  }

  sprite.setPosition(entity.x, entity.y);
  sprite.setAlpha(entity.alive ? 1 : 0.35);
  sprite.base.rotation = entity.aimAngle;
  sprite.healthBar.width = Math.max(0, (entity.health / 100) * 42);
  sprite.nameText.setText(displayName);
  return sprite;
}

function drawBullet(scene, entity, sprite) {
  if (!sprite) {
    sprite = scene.add.circle(entity.x, entity.y, 5, 0xfef08a);
  }

  sprite.setPosition(entity.x, entity.y);
  return sprite;
}

function drawAlien(scene, entity, sprite) {
  if (!sprite) {
    sprite = scene.add.container(entity.x, entity.y);
    const body = scene.add.circle(0, 0, entity.radius, 0xf97316);
    const core = scene.add.circle(0, 0, Math.max(8, entity.radius / 2), 0x7c2d12);
    const healthBarBg = scene.add.rectangle(0, -entity.radius - 12, 38, 5, 0x1f2937);
    const healthBar = scene.add.rectangle(-19, -entity.radius - 12, 38, 5, 0x86efac).setOrigin(0, 0.5);

    sprite.add([healthBarBg, healthBar, body, core]);
    sprite.healthBar = healthBar;
  }

  sprite.setPosition(entity.x, entity.y);
  sprite.healthBar.width = Math.max(0, Math.min(38, (entity.health / entity.maxHealth) * 38));
  return sprite;
}

function syncEntityMap(scene, cache, entities, drawFn) {
  const activeIds = new Set();

  for (const entity of entities) {
    activeIds.add(entity.id);
    const sprite = cache.get(entity.id);
    cache.set(entity.id, drawFn(scene, entity, sprite));
  }

  for (const [id, sprite] of cache.entries()) {
    if (activeIds.has(id)) {
      continue;
    }

    sprite.destroy(true);
    cache.delete(id);
  }
}

function updateHud(snapshot) {
  roomLabel.textContent = `Room: ${snapshot.roomId}`;
  playerCountLabel.textContent = `Players: ${snapshot.playerCount}`;
  scoreLabel.textContent = `Score: ${snapshot.score}`;
  waveLabel.textContent = `Wave: ${snapshot.wave}`;

  const localPlayer = snapshot.players.find((player) => player.id === renderState.playerId);
  if (localPlayer) {
    const displayName = getDisplayName(localPlayer.name, renderState.playerName || "Pilot");
    const healthPercent = Math.max(0, Math.min(100, localPlayer.health));
    const hue = Math.round((healthPercent / 100) * 120);
    healthLabel.textContent = `${displayName} · ${localPlayer.health}/100${localPlayer.alive ? "" : " (down)"}`;
    healthBarFill.style.width = `${healthPercent}%`;
    healthBarFill.style.background = `linear-gradient(90deg, hsl(${hue}, 85%, 48%), hsl(${Math.min(
      120,
      hue + 18
    )}, 78%, 58%))`;
  } else {
    healthLabel.textContent = "Health: -";
    healthBarFill.style.width = "0%";
    healthBarFill.style.background = "linear-gradient(90deg, #22c55e, #84cc16)";
  }

  if (snapshot.gameOver) {
    roomStatus.textContent = "Game over. Refresh to join a new run.";
    joinButton.disabled = true;
  } else {
    roomStatus.textContent =
      snapshot.playerCount < 2
        ? "Need at least 2 players for full co-op pressure. You can still move and survive while waiting."
        : "Wave active. Stay together.";
  }
}

function renderRoomSummary(rooms) {
  if (!rooms.length) {
    roomsContainer.innerHTML = "<div class=\"room-card\">No active rooms yet.</div>";
    return;
  }

  roomsContainer.innerHTML = rooms
    .map(
      (room) =>
        `<div class="room-card">${room.roomId} · ${room.playerCount}/4 players · Wave ${room.wave} · Score ${room.score}${
          room.gameOver ? " · Ended" : ""
        }</div>`
    )
    .join("");
}

function renderHighScores(scores) {
  if (!scores.length) {
    highScoresContainer.innerHTML = "<div class=\"room-card\">No completed runs yet.</div>";
    return;
  }

  highScoresContainer.innerHTML = scores
    .map(
      (entry, index) =>
        `<div class="room-card">#${index + 1} · ${entry.score} pts · Wave ${entry.wave}<br>${entry.players.join(", ")}</div>`
    )
    .join("");
}

function updateShareBox() {
  shareBox.innerHTML = `Share this URL with other players on your LAN:<br><strong>${window.location.origin}</strong>`;
}

joinButton.addEventListener("click", () => {
  joinButton.disabled = true;
  roomStatus.textContent = "Joining room...";
  socket.emit("join-game", {
    name: nameInput.value
  });
});

socket.on("joined-game", ({ playerId, playerName, roomId }) => {
  renderState.playerId = playerId;
  renderState.playerName = getDisplayName(playerName, getDisplayName(nameInput.value));
  nameInput.value = renderState.playerName;
  roomStatus.textContent = `Connected to ${roomId}.`;
});

socket.on("room-summary", (rooms) => {
  renderRoomSummary(rooms);
});

socket.on("state-update", (snapshot) => {
  renderState.snapshot = snapshot;
  updateHud(snapshot);
  overlay.classList.add("compact");
});

socket.on("high-scores", (scores) => {
  renderHighScores(scores);
});

socket.on("disconnect", () => {
  roomStatus.textContent = "Disconnected from server.";
  joinButton.disabled = false;
});

nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !joinButton.disabled) {
    joinButton.click();
  }
});

updateShareBox();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1400,
  height: 900,
  parent: "game",
  backgroundColor: "#08111f",
  scene: [CoopScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});

window.__ALIEN_COOP_GAME__ = game;
