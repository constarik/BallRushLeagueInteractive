// RTP Table simulation — 315 combos
// Run: node rtp_sim.js > rtp_table.json

const FP_ROUND = 1e10;
function fpRound(v) { return Math.round(v * FP_ROUND) / FP_ROUND; }

class JavaRandom {
  constructor(seed) {
    this.seed = BigInt(seed) ^ 0x5DEECE66Dn;
    this.seed = this.seed & 0xFFFFFFFFFFFFn;
  }
  next(bits) {
    this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & 0xFFFFFFFFFFFFn;
    return Number(this.seed >> BigInt(48 - bits));
  }
  nextDouble() {
    return (this.next(26) * 0x8000000 + this.next(27)) / 0x20000000000000;
  }
}

const CONFIG = {
  FIELD: 9, BALL_R: 0.2, SPEED: 0.05, GOAL_R: 1.02,
  CENTER_R: 0.225, CENTER_X: 4.5, CENTER_Y: 4.5,
  COUNTDOWN: 45, GOLDEN_CHANCE: 0.01, EXPLOSIVE_CHANCE: 1/75,
  SPAWN_COOLDOWN: 60, SPAWN_INTERVAL: 60, TIMEOUT_LIMIT: 5,
  PROGRESSIVE_CAP: 5, MAX_ON_FIELD: 10, BET_PER_BALL: 5, MAX_TICKS_PER_BALL: 600
};

function applyCoef(coef) {
  if (coef > 1) {
    CONFIG.SPEED = 0.05;
    CONFIG.COUNTDOWN = Math.round(45 * coef);
    CONFIG.SPAWN_INTERVAL = Math.round(60 * coef);
    CONFIG.SPAWN_COOLDOWN = Math.round(60 * coef);
    CONFIG.MAX_TICKS_PER_BALL = Math.round(600 * coef);
  } else {
    CONFIG.SPEED = 0.05; CONFIG.COUNTDOWN = 45;
    CONFIG.SPAWN_INTERVAL = 60; CONFIG.SPAWN_COOLDOWN = 60;
    CONFIG.MAX_TICKS_PER_BALL = 600;
  }
}
function applySize(size) { CONFIG.BALL_R = 0.2 * size; }
function applyRecharge(r) { CONFIG.CENTER_R = 0.225 * r; }
