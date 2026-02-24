// ===== ENGINE v7.0.1 (Same as server) =====
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
  FIELD: 9,
  BALL_R: 0.2,
  SPEED: 0.05,
  GOAL_R: 1.02,
  CENTER_R: 0.225,
  CENTER_X: 4.5,
  CENTER_Y: 4.5,
  COUNTDOWN: 45,
  GOLDEN_CHANCE: 0.01,
  EXPLOSIVE_CHANCE: 1/75,
  SPAWN_COOLDOWN: 60,
  SPAWN_INTERVAL: 60,
  TIMEOUT_LIMIT: 5,
  PROGRESSIVE_CAP: 5,
  MAX_ON_FIELD: 10,
  BET_PER_BALL: 5,
  MAX_TICKS_PER_BALL: 600
};

function applyCoef(coef) {
  if (coef > 1) {
    CONFIG.SPEED = 0.05;
    CONFIG.COUNTDOWN = Math.round(45 * coef);
    CONFIG.SPAWN_INTERVAL = Math.round(60 * coef);
    CONFIG.SPAWN_COOLDOWN = Math.round(60 * coef);
    CONFIG.MAX_TICKS_PER_BALL = Math.round(600 * coef);
  } else {
    CONFIG.SPEED = coef < 1 ? 0.05 * coef : 0.05;
    CONFIG.COUNTDOWN = 45;
    CONFIG.SPAWN_INTERVAL = 60;
    CONFIG.SPAWN_COOLDOWN = 60;
    CONFIG.MAX_TICKS_PER_BALL = 600;
  }
}

function applySize(size) {
  CONFIG.BALL_R = 0.2 * size;
  CONFIG.CENTER_R = 0.225 * size;
}

function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
function isInLeftGoal(b) { return dist(b.x, b.y, 0, 0) < CONFIG.GOAL_R; }
function isInRightGoal(b) { return dist(b.x, b.y, CONFIG.FIELD, 0) < CONFIG.GOAL_R; }
function isGoal(b) { return isInLeftGoal(b) || isInRightGoal(b); }
function isInCenter(b) { return dist(b.x, b.y, CONFIG.CENTER_X, CONFIG.CENTER_Y) < CONFIG.CENTER_R + CONFIG.BALL_R; }
function isInUpperHalf(b) { return b.y < CONFIG.FIELD / 2; }

function createBall(rng, id) {
  const x = 0.5 + rng.nextDouble() * 8;
  const y = CONFIG.FIELD - 0.3;
  const angle = (220 + rng.nextDouble() * 100) * Math.PI / 180;
  const typeRoll = rng.nextDouble();
  let type = 'normal', multiplier = 1;
  if (typeRoll < CONFIG.GOLDEN_CHANCE) { type = 'golden'; multiplier = 3; }
  else if (typeRoll < CONFIG.GOLDEN_CHANCE + CONFIG.EXPLOSIVE_CHANCE) { type = 'explosive'; multiplier = 1; }
  return { id, x, y, dx: Math.cos(angle) * CONFIG.SPEED, dy: Math.sin(angle) * CONFIG.SPEED, value: 9, ticksSinceCountdown: 0, alive: true, type, multiplier };
}

function randomizeBounce(ball, rng) {
  const angle = Math.atan2(ball.dy, ball.dx) + (rng.nextDouble() - 0.5) * 0.1 * Math.PI;
  const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
  ball.dx = fpRound(Math.cos(angle) * speed);
  ball.dy = fpRound(Math.sin(angle) * speed);
}

class GameEngine {
  static CONFIG = CONFIG;
  static BET_PER_BALL = CONFIG.BET_PER_BALL;

  static createInitialState(seed, numBalls) {
    return {
      rng: new JavaRandom(seed),
      balls: [],
      tickCount: 0,
      ballsSpawned: 0,
      numBalls,
      spawnCooldown: 0,
      progressive: 1,
      timeoutCount: 0,
      totalWin: 0,
      stats: { ballsFired: 0, goals: 0, goalsWin: 0, golden: 0, goldenWin: 0, explosions: 0, explosionsWin: 0, jackpots: 0, jackpotsWin: 0, collisions: 0, collisionsWin: 0, recharges: 0, timeouts: 0, progressiveMax: 1, explodedBalls: 0 },
      finished: false,
      nextBallId: 1
    };
  }

  static tick(state) {
    if (state.finished) return { state, events: [] };
    const events = [];
    const s = { ...state, balls: state.balls.map(b => ({ ...b })), stats: { ...state.stats } };
    s.tickCount++;
    if (s.spawnCooldown > 0) s.spawnCooldown--;

    // SPAWN
    if (s.tickCount % CONFIG.SPAWN_INTERVAL === 0 && s.balls.length < CONFIG.MAX_ON_FIELD && s.spawnCooldown <= 0 && s.ballsSpawned < s.numBalls) {
      const newBall = createBall(s.rng, s.nextBallId++);
      s.balls.push(newBall);
      s.ballsSpawned++;
      s.stats.ballsFired++;
      s.spawnCooldown = CONFIG.SPAWN_COOLDOWN;
      events.push({ type: 'spawn', ball: { ...newBall } });
    }

    // UPDATE
    for (const b of s.balls) {
      if (!b.alive) continue;
      b.ticksSinceCountdown++;
      b.x = fpRound(b.x + b.dx);
      b.y = fpRound(b.y + b.dy);
      const R = CONFIG.BALL_R, F = CONFIG.FIELD;
      if (b.x - R < 0) { b.x = R; b.dx = -b.dx; }
      if (b.x + R > F) { b.x = F - R; b.dx = -b.dx; }
      if (b.y - R < 0) { b.y = R; b.dy = -b.dy; }
      if (b.y + R > F) { b.y = F - R; b.dy = -b.dy; }
      if (b.type !== 'golden' && b.type !== 'explosive' && b.ticksSinceCountdown >= CONFIG.COUNTDOWN && b.value > 0) {
        b.value--;
        b.ticksSinceCountdown = 0;
        if (b.value <= 0) { b.alive = false; b.diedFromTimeout = true; }
      }
      if (b.alive && (b.x - R < 0.01 || b.x + R > F - 0.01 || b.y - R < 0.01 || b.y + R > F - 0.01)) {
        randomizeBounce(b, s.rng);
      }
    }

    // CENTER RECHARGE
    for (const b of s.balls) {
      if (b.alive && isInCenter(b)) {
        const dx = b.x - CONFIG.CENTER_X, dy = b.y - CONFIG.CENTER_Y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) { b.dx = (dx / d) * CONFIG.SPEED; b.dy = (dy / d) * CONFIG.SPEED; randomizeBounce(b, s.rng); }
        if (b.type !== 'golden' && b.type !== 'explosive' && b.value < 9) {
          b.value = 9; b.ticksSinceCountdown = 0; s.stats.recharges++;
          events.push({ type: 'recharge', ball: { ...b } });
        }
      }
    }

    // GOALS
    for (const ball of s.balls) {
      if (!ball.alive) continue;
      if (isGoal(ball)) {
        const prize = ball.value * ball.multiplier * s.progressive;
        s.totalWin += prize;
        s.stats.goals++;
        s.stats.goalsWin += prize;
        if (ball.type === 'golden') { s.stats.golden++; s.stats.goldenWin += prize; s.timeoutCount = 0; }
        if (ball.value === 9 && ball.multiplier >= 3) { s.stats.jackpots++; s.stats.jackpotsWin += prize; }
        if (s.progressive < CONFIG.PROGRESSIVE_CAP) s.progressive++;
        if (s.progressive > s.stats.progressiveMax) s.stats.progressiveMax = s.progressive;
        const side = isInLeftGoal(ball) ? 'left' : 'right';
        events.push({ type: 'goal', ball: { ...ball }, prize, progressive: s.progressive, side });
        ball.alive = false;
        if (ball.type === 'explosive') {
          s.stats.explosions++;
          s.timeoutCount = 0;
          const exploded = [];
          for (const other of s.balls) {
            if (other.alive && other.id !== ball.id && isInUpperHalf(other)) {
              const ePrize = other.value * other.multiplier * s.progressive;
              s.totalWin += ePrize;
              s.stats.goals++;
              s.stats.goalsWin += ePrize;
              s.stats.explosionsWin += ePrize;
              if (other.type === 'golden') { s.stats.golden++; s.stats.goldenWin += ePrize; }
              if (s.progressive < CONFIG.PROGRESSIVE_CAP) s.progressive++;
              if (s.progressive > s.stats.progressiveMax) s.stats.progressiveMax = s.progressive;
              other.alive = false;
              s.stats.explodedBalls++;
              exploded.push({ ball: { ...other }, prize: ePrize });
            }
          }
          events.push({ type: 'explosion', ball: { ...ball }, exploded });
        }
      }
    }

    // COLLISIONS
    const applyImpact = (winner, loser, rng) => {
      const dx = winner.x - loser.x, dy = winner.y - loser.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const nx = dx/d, ny = dy/d;
      const ov = CONFIG.BALL_R * 2 - d;
      if (ov > 0) { winner.x += nx * ov * 0.5; winner.y += ny * ov * 0.5; }
      winner.dx = nx * CONFIG.SPEED;
      winner.dy = ny * CONFIG.SPEED;
      randomizeBounce(winner, rng);
    };
    for (let i = 0; i < s.balls.length; i++) {
      for (let j = i + 1; j < s.balls.length; j++) {
        const b1 = s.balls[i], b2 = s.balls[j];
        if (!b1.alive || !b2.alive) continue;
        if (dist(b1.x, b1.y, b2.x, b2.y) < CONFIG.BALL_R * 2) {
          const s1 = b1.type !== 'normal', s2 = b2.type !== 'normal';
          if (s1 && s2) {
            const dx = b2.x - b1.x, dy = b2.y - b1.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > 0) {
              const nx = dx / d, ny = dy / d, ov = CONFIG.BALL_R * 2 - d;
              if (ov > 0) { b1.x -= nx * ov * 0.5; b1.y -= ny * ov * 0.5; b2.x += nx * ov * 0.5; b2.y += ny * ov * 0.5; }
              b1.dx = -nx * CONFIG.SPEED; b1.dy = -ny * CONFIG.SPEED;
              b2.dx = nx * CONFIG.SPEED; b2.dy = ny * CONFIG.SPEED;
              randomizeBounce(b1, s.rng); randomizeBounce(b2, s.rng);
            }
            continue;
          }
          if (s1) { b2.alive = false; applyImpact(b1, b2, s.rng); s.totalWin += 1; s.stats.collisions++; s.stats.collisionsWin += 1; events.push({ type: 'collision', winner: { ...b1 }, loser: { ...b2 }, prize: 1 }); continue; }
          if (s2) { b1.alive = false; applyImpact(b2, b1, s.rng); s.totalWin += 1; s.stats.collisions++; s.stats.collisionsWin += 1; events.push({ type: 'collision', winner: { ...b2 }, loser: { ...b1 }, prize: 1 }); continue; }
          if (b1.value === b2.value) {
            const prize = b1.value * 2;
            s.totalWin += prize; s.stats.collisions++; s.stats.collisionsWin += prize;
            if (s.rng.nextDouble() < 0.5) { b2.alive = false; applyImpact(b1, b2, s.rng); events.push({ type: 'collision', winner: { ...b1 }, loser: { ...b2 }, prize }); }
            else { b1.alive = false; applyImpact(b2, b1, s.rng); events.push({ type: 'collision', winner: { ...b2 }, loser: { ...b1 }, prize }); }
          } else {
            s.totalWin += 1; s.stats.collisions++; s.stats.collisionsWin += 1;
            const loser = b1.value < b2.value ? b1 : b2;
            const winner = b1.value < b2.value ? b2 : b1;
            loser.alive = false;
            applyImpact(winner, loser, s.rng);
            events.push({ type: 'collision', winner: { ...winner }, loser: { ...loser }, prize: 1 });
          }
        }
      }
    }

    // TIMEOUTS
    for (const b of s.balls) {
      if (!b.alive && b.diedFromTimeout) {
        s.timeoutCount++; s.stats.timeouts++;
        events.push({ type: 'timeout', ball: { ...b } });
        if (s.timeoutCount >= CONFIG.TIMEOUT_LIMIT) { s.progressive = 1; s.timeoutCount = 0; events.push({ type: 'progressiveReset' }); }
        b.diedFromTimeout = false;
      }
    }

    s.balls = s.balls.filter(b => b.alive);

    // SPECIAL CLEANUP
    if (s.ballsSpawned >= s.numBalls && s.balls.length > 0 && s.balls.every(b => b.type === 'golden' || b.type === 'explosive')) {
      for (const b of s.balls) {
        const prize = b.value * b.multiplier * s.progressive;
        s.totalWin += prize; s.stats.goals++; s.stats.goalsWin += prize;
        if (b.type === 'golden') { s.stats.golden++; s.stats.goldenWin += prize; }
        if (s.progressive < CONFIG.PROGRESSIVE_CAP) s.progressive++;
        if (s.progressive > s.stats.progressiveMax) s.stats.progressiveMax = s.progressive;
        events.push({ type: 'autoGoal', ball: { ...b }, prize });
      }
      s.balls = [];
    }

    // END CHECK
    if ((s.ballsSpawned >= s.numBalls && s.balls.length === 0) || s.tickCount >= s.numBalls * CONFIG.MAX_TICKS_PER_BALL) {
      s.finished = true;
      s.stats.totalWin = s.totalWin;
      events.push({ type: 'finished', stats: { ...s.stats, totalWin: s.totalWin } });
    }

    return { state: s, events };
  }

  static simulate(seed, numBalls) {
    let state = GameEngine.createInitialState(seed, numBalls);
    while (!state.finished) { state = GameEngine.tick(state).state; }
    return { ...state.stats, totalWin: state.totalWin };
  }
}
