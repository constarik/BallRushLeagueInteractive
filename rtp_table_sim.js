// Ball Rush League Interactive — RTP Table Simulation
// Run: node rtp_table_sim.js
// Output: rtp_table.json

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

const CFG = {
  FIELD:9, BALL_R:0.2, SPEED:0.05, GOAL_R:1.02,
  CENTER_R:0.225, CENTER_X:4.5, CENTER_Y:4.5,
  COUNTDOWN:45, GOLDEN_CHANCE:0.01, EXPLOSIVE_CHANCE:1/75,
  SPAWN_COOLDOWN:60, SPAWN_INTERVAL:60, TIMEOUT_LIMIT:5,
  PROGRESSIVE_CAP:5, MAX_ON_FIELD:10, BET_PER_BALL:5, MAX_TICKS_PER_BALL:600
};

function resetCFG() {
  CFG.BALL_R=0.2; CFG.CENTER_R=0.225; CFG.SPEED=0.05;
  CFG.COUNTDOWN=45; CFG.SPAWN_INTERVAL=60; CFG.SPAWN_COOLDOWN=60;
  CFG.MAX_TICKS_PER_BALL=600;
}

function applyCoef(coef) {
  if (coef > 1) {
    CFG.SPEED=0.05;
    CFG.COUNTDOWN=Math.round(45*coef);
    CFG.SPAWN_INTERVAL=Math.round(60*coef);
    CFG.SPAWN_COOLDOWN=Math.round(60*coef);
    CFG.MAX_TICKS_PER_BALL=Math.round(600*coef);
  } else {
    CFG.SPEED=coef<1?0.05*coef:0.05;
    CFG.COUNTDOWN=45; CFG.SPAWN_INTERVAL=60;
    CFG.SPAWN_COOLDOWN=60; CFG.MAX_TICKS_PER_BALL=600;
  }
}
function applySize(size) { CFG.BALL_R = 0.2 * size; }
function applyRecharge(r) { CFG.CENTER_R = 0.225 * r; }

function dist(ax,ay,bx,by) { const dx=bx-ax,dy=by-ay; return Math.sqrt(dx*dx+dy*dy); }
function isInLeftGoal(b)  { return dist(b.x,b.y,0,0)<CFG.GOAL_R; }
function isInRightGoal(b) { return dist(b.x,b.y,CFG.FIELD,0)<CFG.GOAL_R; }
function isGoal(b)        { return isInLeftGoal(b)||isInRightGoal(b); }
function isInCenter(b)    { return dist(b.x,b.y,CFG.CENTER_X,CFG.CENTER_Y)<CFG.CENTER_R+CFG.BALL_R; }
function isInUpperHalf(b) { return b.y<CFG.FIELD/2; }

function createBall(rng, id) {
  const x=0.5+rng.nextDouble()*8, y=CFG.FIELD-0.3;
  const angle=(220+rng.nextDouble()*100)*Math.PI/180;
  const typeRoll=rng.nextDouble();
  let type='normal', multiplier=1;
  if (typeRoll<CFG.GOLDEN_CHANCE) { type='golden'; multiplier=3; }
  else if (typeRoll<CFG.GOLDEN_CHANCE+CFG.EXPLOSIVE_CHANCE) { type='explosive'; }
  return { id,x,y,dx:Math.cos(angle)*CFG.SPEED,dy:Math.sin(angle)*CFG.SPEED,
           value:9,ticksSinceCountdown:0,alive:true,type,multiplier };
}

function randomizeBounce(ball, rng) {
  const angle=Math.atan2(ball.dy,ball.dx)+(rng.nextDouble()-0.5)*0.1*Math.PI;
  const speed=Math.sqrt(ball.dx*ball.dx+ball.dy*ball.dy);
  ball.dx=fpRound(Math.cos(angle)*speed);
  ball.dy=fpRound(Math.sin(angle)*speed);
}

function simulate(seed, numBalls) {
  const rng = new JavaRandom(seed);
  let balls=[], tickCount=0, ballsSpawned=0, spawnCooldown=0;
  let progressive=1, timeoutCount=0, totalWin=0, nextBallId=1;
  let finished=false;

  while (!finished) {
    tickCount++;
    if (spawnCooldown>0) spawnCooldown--;
    if (tickCount%CFG.SPAWN_INTERVAL===0 && balls.length<CFG.MAX_ON_FIELD && spawnCooldown<=0 && ballsSpawned<numBalls) {
      balls.push(createBall(rng, nextBallId++));
      ballsSpawned++;
      spawnCooldown=CFG.SPAWN_COOLDOWN;
    }
    for (const b of balls) {
      if (!b.alive) continue;
      b.ticksSinceCountdown++;
      b.x=fpRound(b.x+b.dx); b.y=fpRound(b.y+b.dy);
      const R=CFG.BALL_R, F=CFG.FIELD;
      if(b.x-R<0){b.x=R;b.dx=-b.dx;} if(b.x+R>F){b.x=F-R;b.dx=-b.dx;}
      if(b.y-R<0){b.y=R;b.dy=-b.dy;} if(b.y+R>F){b.y=F-R;b.dy=-b.dy;}
      if(b.type!=='golden'&&b.type!=='explosive'&&b.ticksSinceCountdown>=CFG.COUNTDOWN&&b.value>0) {
        b.value--; b.ticksSinceCountdown=0;
        if(b.value<=0){b.alive=false;b.diedFromTimeout=true;}
      }
      if(b.alive&&(b.x-R<0.01||b.x+R>F-0.01||b.y-R<0.01||b.y+R>F-0.01)) randomizeBounce(b,rng);
    }
    for (const b of balls) {
      if(b.alive&&isInCenter(b)){
        const dx=b.x-CFG.CENTER_X,dy=b.y-CFG.CENTER_Y,d=Math.sqrt(dx*dx+dy*dy);
        if(d>0){b.dx=(dx/d)*CFG.SPEED;b.dy=(dy/d)*CFG.SPEED;randomizeBounce(b,rng);}
        if(b.type!=='golden'&&b.type!=='explosive'&&b.value<9){b.value=9;b.ticksSinceCountdown=0;}
      }
    }
    for (const ball of balls) {
      if(!ball.alive) continue;
      if(isGoal(ball)){
        const prize=ball.value*ball.multiplier*progressive;
        totalWin+=prize;
        if(ball.type==='golden'){timeoutCount=0;}
        if(progressive<CFG.PROGRESSIVE_CAP) progressive++;
        ball.alive=false;
        if(ball.type==='explosive'){
          timeoutCount=0;
          for(const other of balls){
            if(other.alive&&other.id!==ball.id&&isInUpperHalf(other)){
              totalWin+=other.value*other.multiplier*progressive;
              if(progressive<CFG.PROGRESSIVE_CAP) progressive++;
              other.alive=false;
            }
          }
        }
      }
    }
    const applyImpact=(winner,loser)=>{
      const dx=winner.x-loser.x,dy=winner.y-loser.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      const nx=dx/d,ny=dy/d,ov=CFG.BALL_R*2-d;
      if(ov>0){winner.x+=nx*ov*0.5;winner.y+=ny*ov*0.5;}
      winner.dx=nx*CFG.SPEED; winner.dy=ny*CFG.SPEED;
      randomizeBounce(winner,rng);
    };
    for(let i=0;i<balls.length;i++){
      for(let j=i+1;j<balls.length;j++){
        const b1=balls[i],b2=balls[j];
        if(!b1.alive||!b2.alive) continue;
        if(dist(b1.x,b1.y,b2.x,b2.y)<CFG.BALL_R*2){
          const s1=b1.type!=='normal',s2=b2.type!=='normal';
          if(s1&&s2){
            const dx=b2.x-b1.x,dy=b2.y-b1.y,d=Math.sqrt(dx*dx+dy*dy);
            if(d>0){const nx=dx/d,ny=dy/d,ov=CFG.BALL_R*2-d;if(ov>0){b1.x-=nx*ov*0.5;b1.y-=ny*ov*0.5;b2.x+=nx*ov*0.5;b2.y+=ny*ov*0.5;}b1.dx=-nx*CFG.SPEED;b1.dy=-ny*CFG.SPEED;b2.dx=nx*CFG.SPEED;b2.dy=ny*CFG.SPEED;randomizeBounce(b1,rng);randomizeBounce(b2,rng);}
            continue;
          }
          if(s1){b2.alive=false;applyImpact(b1,b2);totalWin+=1;continue;}
          if(s2){b1.alive=false;applyImpact(b2,b1);totalWin+=1;continue;}
          if(b1.value===b2.value){totalWin+=b1.value*2;if(rng.nextDouble()<0.5){b2.alive=false;applyImpact(b1,b2);}else{b1.alive=false;applyImpact(b2,b1);}}
          else{totalWin+=1;const loser=b1.value<b2.value?b1:b2,winner=b1.value<b2.value?b2:b1;loser.alive=false;applyImpact(winner,loser);}
        }
      }
    }
    for(const b of balls){
      if(!b.alive&&b.diedFromTimeout){
        timeoutCount++;
        if(timeoutCount>=CFG.TIMEOUT_LIMIT){progressive=1;timeoutCount=0;}
        b.diedFromTimeout=false;
      }
    }
    balls=balls.filter(b=>b.alive);
    if(ballsSpawned>=numBalls&&balls.length>0&&balls.every(b=>b.type==='golden'||b.type==='explosive')){
      for(const b of balls){totalWin+=b.value*b.multiplier*progressive;if(progressive<CFG.PROGRESSIVE_CAP)progressive++;}
      balls=[];
    }
    if((ballsSpawned>=numBalls&&balls.length===0)||tickCount>=numBalls*CFG.MAX_TICKS_PER_BALL) finished=true;
  }
  return totalWin;
}

// === RUN TABLE ===
const NB   = 100000;
const BET  = CFG.BET_PER_BALL;
const SEED = Math.floor(Date.now() / 1000);

const sizes     = [1.0, 1.5, 2.0, 2.5, 3.0];
const recharges = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
const coefs     = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

const table = {};
let done = 0;
const total = sizes.length * recharges.length * coefs.length;
const tStart = Date.now();

console.log('=== БРЛИ RTP Table Simulation ===');
console.log(`Balls: ${NB.toLocaleString()} | Seed: ${SEED} | Combinations: ${total}`);
console.log('');

for (const size of sizes) {
  console.log(`\n▶ SIZE = ${size}`);
  for (const recharge of recharges) {
    for (const coef of coefs) {
      resetCFG();
      applySize(size);
      applyRecharge(recharge);
      applyCoef(coef);

      const win = simulate(SEED, NB);
      const rtp = Math.round(win / (NB * BET) * 10000) / 100;
      const key = `${size.toFixed(1)}_${recharge.toFixed(1)}_${coef.toFixed(1)}`;
      table[key] = rtp;
      done++;

      const elapsed = ((Date.now()-tStart)/1000).toFixed(0);
      const eta = Math.round((Date.now()-tStart)/done*(total-done)/1000);
      console.log(`  [${done}/${total}] s=${size} r=${recharge} c=${coef} | BALL_R=${CFG.BALL_R.toFixed(2)} CENTER_R=${CFG.CENTER_R.toFixed(3)} COUNTDOWN=${CFG.COUNTDOWN} | RTP=${rtp}% | ${elapsed}s elapsed, ~${eta}s left`);
    }
  }
}

const fs = require('fs');
fs.writeFileSync('rtp_table.json', JSON.stringify(table, null, 2));
console.log(`\n✅ Done! ${total} combinations in ${((Date.now()-tStart)/1000).toFixed(1)}s`);
console.log('Saved: rtp_table.json');
