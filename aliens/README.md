# Alien Co-op

Simple browser-based multiplayer co-op survival game built with Phaser.js on the client and Node.js, Express, and Socket.io on the server.

## What The Game Is

Alien Co-op is a lightweight top-down browser survival game for 2 to 4 players per room.

Players join the same room, move around a shared map, and work together to survive waves of aliens that spawn from the edges of the arena.

The server is authoritative for:

- player state
- bullets
- alien movement
- collisions
- health changes
- score

All visuals are generated with simple Phaser shapes, so there are no external art assets to install.

## How The Game Works

- Each player joins with a pilot name.
- Players spawn near the center of the map.
- Aliens spawn in waves from the outer edges of the arena.
- Aliens chase the nearest living player.
- Players lose health when aliens touch them.
- The team shares one score.
- The run ends when all players are down.
- Completed runs are added to the high-score list.

## Controls

- Move: `WASD` or arrow keys
- Aim: move the mouse
- Shoot: mouse click or `Space`

## Multiplayer

- Room size: 2 to 4 players
- Players can still join a room before it fills up
- The game is played in a browser on the same machine or across the same LAN

To let someone else join:

1. Start the server on the host machine.
2. Find the host machine IP, for example `192.168.68.69`.
3. Have the other player open `http://<host-ip>:3000` in a browser.

Example:

```text
http://192.168.68.69:3000
```

If you use a firewall, allow TCP `3000` only from your private subnet if you want LAN-only access.

## Features

- 2D top-down co-op gameplay
- Phaser.js client rendering
- Node.js + Express + Socket.io backend
- Shared score and wave counter
- Player health and alien health
- Mouse aiming and projectile shooting
- Persistent high scores saved by the server
- No external asset dependencies required

## Project Structure

- `client/`: Phaser UI, rendering, HUD, and input forwarding
- `server/`: Express app, Socket.io transport, room management, authoritative game loop, and high-score persistence

## Requirements

- Node.js
- npm

If Node.js is not installed on Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm
```

## How To Start The Game

From the project root:

```bash
npm install
npm start
```

The server starts on port `3000`.

Open one of these in your browser:

- `http://localhost:3000` on the same machine
- `http://<host-ip>:3000` from another device on the same network

Example:

```text
http://192.168.68.69:3000
```

## How To Stop The Game

If the server is running in a terminal, press:

```bash
Ctrl+C
```

## Development Notes

- The server ticks at 20 FPS and broadcasts full room snapshots to clients.
- The client renders server state and forwards player input.
- High scores are stored in `server/highscores.json`.
- Comments in the server explain the core systems: rooms, waves, AI, and collision handling.
