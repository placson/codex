const GAME_CONFIG = {
  host: "0.0.0.0",
  port: 3000,
  tickRate: 20,
  mapWidth: 1400,
  mapHeight: 900,
  maxPlayersPerRoom: 4,
  minPlayersPerRoom: 2,
  playerRadius: 18,
  playerSpeed: 260,
  playerMaxHealth: 100,
  bulletRadius: 5,
  bulletSpeed: 620,
  bulletDamage: 20,
  bulletLifetimeMs: 1100,
  shootCooldownMs: 180,
  alienRadius: 20,
  alienSpeedBase: 72,
  alienHealthBase: 45,
  alienTouchDamage: 10,
  alienContactCooldownMs: 600,
  waveIntervalMs: 2500,
  maxAliensPerWaveBase: 4
};

module.exports = { GAME_CONFIG };
