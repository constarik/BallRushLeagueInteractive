// ===== БРЛИ Simulation Worker =====
// Engine v7.0.1 (inline copy, no DOM)

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
    CONFIG.SPEED = coef < 1 ? 0.05 * coef : 0.05;
    CONFIG.COUNTDOWN = 45; CONFIG.SPAWN_INTERVAL = 60;
    CONFIG.SPAWN_COOLDOWN = 60; CONFIG.MAX_TICKS_PER_BALL = 600;
  }
}
function applySize(size) { CONFIG.BALL_R = 0.2 * size; }
function applyRecharge(r) { CONFIG.CENTER_R = 0.225 * r; }

function dist(ax, ay, bx, by) { const dx=bx-ax, dy=by-ay; return Math.sqrt(dx*dx+dy*dy); }
function isInLeftGoal(b)  { return dist(b.x,b.y,0,0) < CONFIG.GOAL_R; }
function isInRightGoal(b) { return dist(b.x,b.y,CONFIG.FIELD,0) < CONFIG.GOAL_R; }
function isGoal(b) { return isInLeftGoal(b) || isInRightGoal(b); }
function isInCenter(b) { return dist(b.x,b.y,CONFIG.CENTER_X,CONFIG.CENTER_Y) < CONFIG.CENTER_R+CONFIG.BALL_R; }
function isInUpperHalf(b) { return b.y < CONFIG.FIELD/2; }

function createBall(rng, id) {
  const x = 0.5 + rng.nextDouble() * 8;
  const y = CONFIG.FIELD - 0.3;
  const angle = (220 + rng.nextDouble() * 100) * Math.PI / 180;
  const typeRoll = rng.nextDouble();
  let type = 'normal', multiplier = 1;
  if (typeRoll < CONFIG.GOLDEN_CHANCE) { type = 'golden'; multiplier = 3; }
  else if (typeRoll < CONFIG.GOLDEN_CHANCE + CONFIG.EXPLOSIVE_CHANCE) { type = 'explosive'; }
  return { id, x, y, dx: Math.cos(angle)*CONFIG.SPEED, dy: Math.sin(angle)*CONFIG.SPEED,
           value: 9, ticksSinceCountdown: 0, alive: true, type, multiplier };
}

function randomizeBounce(ball, rng) {
  const angle = Math.atan2(ball.dy, ball.dx) + (rng.nextDouble()-0.5)*0.1*Math.PI;
  const speed = Math.sqrt(ball.dx*ball.dx + ball.dy*ball.dy);
  ball.dx = fpRound(Math.cos(angle)*speed);
  ball.dy = fpRound(Math.sin(angle)*speed);
}

function tick(state) {
  if (state.finished) return state;
  const s = state; // mutate in place for worker performance
  s.tickCount++;
  if (s.spawnCooldown > 0) s.spawnCooldown--;

  if (s.tickCount % CONFIG.SPAWN_INTERVAL === 0 && s.balls.length < CONFIG.MAX_ON_FIELD &&
      s.spawnCooldown <= 0 && s.ballsSpawned < s.numBalls) {
    s.balls.push(createBall(s.rng, s.nextBallId++));
    s.ballsSpawned++;
    s.stats.ballsFired++;
    s.spawnCooldown = CONFIG.SPAWN_COOLDOWN;
  }

  for (const b of s.balls) {
    if (!b.alive) continue;
    b.ticksSinceCountdown++;
    b.x = fpRound(b.x + b.dx); b.y = fpRound(b.y + b.dy);
    const R = CONFIG.BALL_R, F = CONFIG.FIELD;
    if (b.x-R<0){b.x=R;b.dx=-b.dx;} if(b.x+R>F){b.x=F-R;b.dx=-b.dx;}
    if (b.y-R<0){b.y=R;b.dy=-b.dy;} if(b.y+R>F){b.y=F-R;b.dy=-b.dy;}
    if (b.type!=='golden'&&b.type!=='explosive'&&b.ticksSinceCountdown>=CONFIG.COUNTDOWN&&b.value>0) {
      b.value--; b.ticksSinceCountdown=0;
      if (b.value<=0) { b.alive=false; b.diedFromTimeout=true; }
    }
    if (b.alive&&(b.x-R<0.01||b.x+R>F-0.01||b.y-R<0.01||b.y+R>F-0.01)) randomizeBounce(b,s.rng);
  }

  for (const b of s.balls) {
    if (b.alive && isInCenter(b)) {
      const dx=b.x-CONFIG.CENTER_X, dy=b.y-CONFIG.CENTER_Y, d=Math.sqrt(dx*dx+dy*dy);
      if (d>0) { b.dx=(dx/d)*CONFIG.SPEED; b.dy=(dy/d)*CONFIG.SPEED; randomizeBounce(b,s.rng); }
      if (b.type!=='golden'&&b.type!=='explosive'&&b.value<9) {
        b.value=9; b.ticksSinceCountdown=0; s.stats.recharges++;
      }
    }
  }

  for (const ball of s.balls) {
    if (!ball.alive) continue;
    if (isGoal(ball)) {
      const prize = ball.value * ball.multiplier * s.progressive;
      s.totalWin += prize; s.stats.goals++; s.stats.goalsWin += prize;
      if (ball.type==='golden') { s.stats.golden++; s.stats.goldenWin+=prize; s.timeoutCount=0; }
      if (ball.value===9&&ball.multiplier>=3) { s.stats.jackpots++; s.stats.jackpotsWin+=prize; }
      if (s.progressive<CONFIG.PROGRESSIVE_CAP) s.progressive++;
      if (s.progressive>s.stats.progressiveMax) s.stats.progressiveMax=s.progressive;
      ball.alive = false;
      if (ball.type==='explosive') {
        s.stats.explosions++; s.timeoutCount=0;
        for (const other of s.balls) {
          if (other.alive&&other.id!==ball.id&&isInUpperHalf(other)) {
            const ep=other.value*other.multiplier*s.progressive;
            s.totalWin+=ep; s.stats.goals++; s.stats.goalsWin+=ep; s.stats.explosionsWin+=ep;
            if (other.type==='golden'){s.stats.golden++;s.stats.goldenWin+=ep;}
            if (s.progressive<CONFIG.PROGRESSIVE_CAP) s.progressive++;
            if (s.progressive>s.stats.progressiveMax) s.stats.progressiveMax=s.progressive;
            other.alive=false; s.stats.explodedBalls++;
          }
        }
      }
    }
  }

  const applyImpact=(winner,loser)=>{
    const dx=winner.x-loser.x,dy=winner.y-loser.y,d=Math.sqrt(dx*dx+dy*dy)||1;
    const nx=dx/d,ny=dy/d,ov=CONFIG.BALL_R*2-d;
    if(ov>0){winner.x+=nx*ov*0.5;winner.y+=ny*ov*0.5;}
    winner.dx=nx*CONFIG.SPEED; winner.dy=ny*CONFIG.SPEED;
    randomizeBounce(winner,s.rng);
  };
  for (let i=0;i<s.balls.length;i++) {
    for (let j=i+1;j<s.balls.length;j++) {
      const b1=s.balls[i],b2=s.balls[j];
      if(!b1.alive||!b2.alive) continue;
      if(dist(b1.x,b1.y,b2.x,b2.y)<CONFIG.BALL_R*2) {
        const s1=b1.type!=='normal',s2=b2.type!=='normal';
        if(s1&&s2){const dx=b2.x-b1.x,dy=b2.y-b1.y,d=Math.sqrt(dx*dx+dy*dy);if(d>0){const nx=dx/d,ny=dy/d,ov=CONFIG.BALL_R*2-d;if(ov>0){b1.x-=nx*ov*0.5;b1.y-=ny*ov*0.5;b2.x+=nx*ov*0.5;b2.y+=ny*ov*0.5;}b1.dx=-nx*CONFIG.SPEED;b1.dy=-ny*CONFIG.SPEED;b2.dx=nx*CONFIG.SPEED;b2.dy=ny*CONFIG.SPEED;randomizeBounce(b1,s.rng);randomizeBounce(b2,s.rng);}continue;}
        if(s1){b2.alive=false;applyImpact(b1,b2);s.totalWin+=1;s.stats.collisions++;s.stats.collisionsWin+=1;continue;}
        if(s2){b1.alive=false;applyImpact(b2,b1);s.totalWin+=1;s.stats.collisions++;s.stats.collisionsWin+=1;continue;}
        if(b1.value===b2.value){const prize=b1.value*2;s.totalWin+=prize;s.stats.collisions++;s.stats.collisionsWin+=prize;if(s.rng.nextDouble()<0.5){b2.alive=false;applyImpact(b1,b2);}else{b1.alive=false;applyImpact(b2,b1);}}
        else{s.totalWin+=1;s.stats.collisions++;s.stats.collisionsWin+=1;const loser=b1.value<b2.value?b1:b2,winner=b1.value<b2.value?b2:b1;loser.alive=false;applyImpact(winner,loser);}
      }
    }
  }

  for (const b of s.balls) {
    if (!b.alive&&b.diedFromTimeout) {
      s.timeoutCount++; s.stats.timeouts++;
      if(s.timeoutCount>=CONFIG.TIMEOUT_LIMIT){s.progressive=1;s.timeoutCount=0;}
      b.diedFromTimeout=false;
    }
  }
  s.balls = s.balls.filter(b=>b.alive);

  if(s.ballsSpawned>=s.numBalls&&s.balls.length>0&&s.balls.every(b=>b.type==='golden'||b.type==='explosive')){
    for(const b of s.balls){const prize=b.value*b.multiplier*s.progressive;s.totalWin+=prize;s.stats.goals++;s.stats.goalsWin+=prize;if(b.type==='golden'){s.stats.golden++;s.stats.goldenWin+=prize;}if(s.progressive<CONFIG.PROGRESSIVE_CAP)s.progressive++;if(s.progressive>s.stats.progressiveMax)s.stats.progressiveMax=s.progressive;}
    s.balls=[];
  }
  if((s.ballsSpawned>=s.numBalls&&s.balls.length===0)||s.tickCount>=s.numBalls*CONFIG.MAX_TICKS_PER_BALL) {
    s.finished=true;
  }
  return s;
}

// ===== WORKER MESSAGE HANDLER =====
let stopped = false;

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'stop') { stopped = true; return; }

  if (msg.type === 'sim') {
    stopped = false;
    const { seed, numBalls, coef, size, recharge, goalR, perSession } = msg;

    // Reset CONFIG
    CONFIG.BALL_R=0.2; CONFIG.CENTER_R=0.225; CONFIG.SPEED=0.05;
    CONFIG.COUNTDOWN=45; CONFIG.SPAWN_INTERVAL=60; CONFIG.SPAWN_COOLDOWN=60;
    CONFIG.MAX_TICKS_PER_BALL=600; CONFIG.GOAL_R=1.02;
    if (goalR) CONFIG.GOAL_R = parseFloat(goalR);
    applySize(size); applyRecharge(recharge); applyCoef(coef);

    const BET = CONFIG.BET_PER_BALL;

    if (!perSession || perSession <= 0) {
      // Single run with progress updates
      let state = {
        rng: new JavaRandom(seed), balls: [], tickCount: 0, ballsSpawned: 0,
        numBalls, spawnCooldown: 0, progressive: 1, timeoutCount: 0, totalWin: 0,
        stats: { ballsFired:0,goals:0,goalsWin:0,golden:0,goldenWin:0,explosions:0,
                 explosionsWin:0,jackpots:0,jackpotsWin:0,collisions:0,collisionsWin:0,
                 recharges:0,timeouts:0,progressiveMax:1,explodedBalls:0 },
        finished: false, nextBallId: 1
      };

      const REPORT_INTERVAL = 10000; // report every 10k balls
      let lastReport = 0;

      while (!state.finished && !stopped) {
        state = tick(state);
        if (state.stats.ballsFired - lastReport >= REPORT_INTERVAL) {
          lastReport = state.stats.ballsFired;
          self.postMessage({ type: 'progress', stats: {...state.stats}, totalWin: state.totalWin,
            numBalls, config: { GOAL_R: CONFIG.GOAL_R, BALL_R: CONFIG.BALL_R,
              CENTER_R: CONFIG.CENTER_R, COUNTDOWN: CONFIG.COUNTDOWN, MAX_TICKS_PER_BALL: CONFIG.MAX_TICKS_PER_BALL }
          });
        }
      }

      self.postMessage({
        type: stopped ? 'stopped' : 'done',
        stats: {...state.stats}, totalWin: state.totalWin, numBalls, seed,
        coef, size, recharge,
        config: { GOAL_R: CONFIG.GOAL_R, BALL_R: CONFIG.BALL_R,
          CENTER_R: CONFIG.CENTER_R, COUNTDOWN: CONFIG.COUNTDOWN, MAX_TICKS_PER_BALL: CONFIG.MAX_TICKS_PER_BALL }
      });

    } else {
      // Session-based
      const sessions = Math.floor(numBalls / perSession);
      let rtps=[], tBet=0, tWin=0;
      for (let i=0; i<sessions && !stopped; i++) {
        let state = {
          rng: new JavaRandom(seed+i), balls: [], tickCount:0, ballsSpawned:0,
          numBalls: perSession, spawnCooldown:0, progressive:1, timeoutCount:0, totalWin:0,
          stats:{ballsFired:0,goals:0,goalsWin:0,golden:0,goldenWin:0,explosions:0,
                 explosionsWin:0,jackpots:0,jackpotsWin:0,collisions:0,collisionsWin:0,
                 recharges:0,timeouts:0,progressiveMax:1,explodedBalls:0},
          finished:false, nextBallId:1
        };
        while (!state.finished) state = tick(state);
        const bet = state.stats.ballsFired * BET;
        tBet += bet; tWin += state.totalWin;
        rtps.push(bet > 0 ? state.totalWin/bet*100 : 0);
        if (i % 10 === 0) {
          self.postMessage({ type: 'session_progress', done: i+1, sessions });
        }
      }
      const avg = rtps.reduce((a,b)=>a+b,0)/rtps.length;
      const min = Math.min(...rtps), max = Math.max(...rtps);
      const std = Math.sqrt(rtps.map(r=>(r-avg)**2).reduce((a,b)=>a+b,0)/rtps.length);
      self.postMessage({ type: stopped?'stopped':'done_sessions',
        sessions: rtps.length, avg: avg.toFixed(2), min: min.toFixed(2),
        max: max.toFixed(2), std: std.toFixed(2),
        totalRtp: (tWin/tBet*100).toFixed(2)
      });
    }
  }

  if (msg.type === 'scan') {
    stopped = false;
    const { runs, ballsPerRun } = msg;
    const SIZES     = [1.0, 1.5, 2.0, 2.5, 3.0];
    const RECHARGES = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    const COEFS     = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
    const BET = CONFIG.BET_PER_BALL;

    const results = [];
    let i = 0;

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function runOne() {
      if (i >= runs || stopped) {
        // done — compute stats
        const rtps = results.map(r => r.rtp).sort((a,b) => a-b);
        const n = rtps.length;
        const mean = rtps.reduce((a,b)=>a+b,0)/n;
        const std  = Math.sqrt(rtps.map(r=>(r-mean)**2).reduce((a,b)=>a+b,0)/n);
        const med  = n%2===0 ? (rtps[n/2-1]+rtps[n/2])/2 : rtps[Math.floor(n/2)];

        // top 10 highest RTP
        const top10 = [...results].sort((a,b)=>b.rtp-a.rtp).slice(0,10);
        // bottom 10
        const bot10 = [...results].sort((a,b)=>a.rtp-b.rtp).slice(0,10);

        self.postMessage({ type: 'scan_done', stopped,
          n, mean: mean.toFixed(2), std: std.toFixed(2),
          med: med.toFixed(2), min: rtps[0].toFixed(2), max: rtps[n-1].toFixed(2),
          p5:  rtps[Math.floor(n*.05)].toFixed(2),
          p25: rtps[Math.floor(n*.25)].toFixed(2),
          p75: rtps[Math.floor(n*.75)].toFixed(2),
          p95: rtps[Math.floor(n*.95)].toFixed(2),
          over200: rtps.filter(r=>r>200).length,
          over150: rtps.filter(r=>r>150).length,
          under80: rtps.filter(r=>r<80).length,
          top10, bot10
        });
        return;
      }

      const size     = pick(SIZES);
      const recharge = pick(RECHARGES);
      const coef     = pick(COEFS);
      const seed     = Math.floor(Math.random() * 0x7FFFFFFF);

      CONFIG.BALL_R=0.2; CONFIG.CENTER_R=0.225; CONFIG.SPEED=0.05;
      CONFIG.COUNTDOWN=45; CONFIG.SPAWN_INTERVAL=60;
      CONFIG.SPAWN_COOLDOWN=60; CONFIG.MAX_TICKS_PER_BALL=600; CONFIG.GOAL_R=1.02;
      applySize(size); applyRecharge(recharge); applyCoef(coef);

      let state = {
        rng: new JavaRandom(seed), balls: [], tickCount:0, ballsSpawned:0,
        numBalls: ballsPerRun, spawnCooldown:0, progressive:1, timeoutCount:0, totalWin:0,
        stats:{ballsFired:0,goals:0,goalsWin:0,golden:0,goldenWin:0,explosions:0,
               explosionsWin:0,jackpots:0,jackpotsWin:0,collisions:0,collisionsWin:0,
               recharges:0,timeouts:0,progressiveMax:1,explodedBalls:0},
        finished:false, nextBallId:1
      };
      while (!state.finished) state = tick(state);

      const rtp = state.totalWin / (ballsPerRun * BET) * 100;
      results.push({ size, recharge, coef, seed, rtp: Math.round(rtp*100)/100 });
      i++;

      if (i % 50 === 0) {
        self.postMessage({ type: 'scan_progress', done: i, runs });
      }
      // yield every 100 to avoid blocking
      if (i % 100 === 0) { setTimeout(runOne, 0); } else { runOne(); }
    }
    runOne();
  }
};
