const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { GAME_CONFIG } = require("./config");
const { GameRoom } = require("./gameRoom");
const { HighScoreStore } = require("./highScoreStore");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();
const highScoreStore = new HighScoreStore();
let nextRoomNumber = 1;

function normalizePlayerName(rawName) {
  const trimmed = typeof rawName === "string" ? rawName.trim() : "";
  const compact = trimmed.replace(/\s+/g, " ");
  if (!compact) {
    return "Pilot";
  }

  return compact.slice(0, 18);
}

function getRoomSummaries() {
  return [...rooms.values()].map((room) => ({
    roomId: room.id,
    playerCount: room.getPlayerCount(),
    score: room.score,
    wave: room.wave,
    gameOver: room.gameOver
  }));
}

function getOrCreateRoom() {
  for (const room of rooms.values()) {
    if (room.isJoinable()) {
      return room;
    }
  }

  const room = new GameRoom(`room-${nextRoomNumber++}`, io);
  rooms.set(room.id, room);
  return room;
}

function emitRoomSummary() {
  io.emit("room-summary", getRoomSummaries());
}

function emitHighScores(target = io) {
  target.emit("high-scores", highScoreStore.list());
}

app.use("/client", express.static(path.join(__dirname, "..", "client")));
app.use("/phaser", express.static(path.join(__dirname, "..", "node_modules", "phaser", "dist")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("room-summary", getRoomSummaries());
  emitHighScores(socket);

  socket.on("join-game", ({ name } = {}) => {
    const room = getOrCreateRoom();
    const player = room.addPlayer(socket, normalizePlayerName(name));

    socket.emit("joined-game", {
      playerId: player.id,
      playerName: player.name,
      roomId: room.id,
      minPlayers: GAME_CONFIG.minPlayersPerRoom,
      maxPlayers: GAME_CONFIG.maxPlayersPerRoom
    });

    emitRoomSummary();
  });

  socket.on("player-input", (input) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (room) {
      room.setInput(socket.id, input);
    }
  });

  socket.on("shoot", () => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (room) {
      room.spawnBullet(socket.id);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    room.removePlayer(socket.id);
    if (room.getPlayerCount() === 0) {
      rooms.delete(room.id);
    }
    emitRoomSummary();
  });
});

const tickMs = 1000 / GAME_CONFIG.tickRate;
setInterval(() => {
  for (const room of rooms.values()) {
    room.update(tickMs);
    const finishedRun = room.consumeFinishedRun();
    if (finishedRun) {
      highScoreStore.add(finishedRun);
      emitHighScores();
    }
    io.to(room.id).emit("state-update", room.createSnapshot());
  }
  emitRoomSummary();
}, tickMs);

server.listen(GAME_CONFIG.port, GAME_CONFIG.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Alien co-op server running at http://localhost:${GAME_CONFIG.port}`);
});
