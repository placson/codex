# Alien Co-op

Simple browser-based multiplayer co-op survival game built with Phaser.js on the client and Node.js, Express, and Socket.io on the server.

## Features

- 2D top-down co-op gameplay for 2 to 4 players per room
- WASD/arrow movement, mouse aiming, and shooting with mouse click or spacebar
- Server-authoritative alien movement, damage, health, bullets, and score
- Shared waves of aliens spawning from the arena edges
- Shared team score, health HUD, room count, and game-over state
- No external art assets required; all visuals use Phaser shapes

## Project Structure

- `client/`: Phaser UI, rendering, HUD, and input forwarding
- `server/`: Express app, Socket.io transport, room management, and authoritative game loop

## Run Locally

```bash
npm install
npm start
```

Then open `http://localhost:3000` in 2 or more browser tabs.

## Notes

- The server ticks at 20 FPS and broadcasts a full room snapshot to keep the client renderer simple.
- Comments in the server explain the core systems: room state, wave spawning, AI targeting, and collision handling.
