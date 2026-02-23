# Ball Rush League — Launch Devlog

## 🔐 v8.0.57 — Provably Fair & Mobile Polish

### Provably Fair Protocol

Ball Rush League is now provably fair — every game result can be independently verified by the player.

The system uses a two-stage seed exchange protocol:

1. Before the game starts, the client generates a random `clientSeed` and sends only its SHA256 hash to the server.
2. The server generates its own `serverSeed` and returns only its SHA256 hash.
3. Neither party knows the other's seed before the game begins.
4. The client reveals `clientSeed` via `/reveal_seed` — server verifies the hash and computes `finalSeed = serverSeed XOR clientSeed`.
5. After the game, `/result` reveals `serverSeed` — the player can verify both hashes and recompute `finalSeed` independently.

This means neither the server nor the player can manipulate the outcome. The game is deterministic given `finalSeed`, and both parties committed to their seeds before it was computed.

After each game, the seed is displayed as `✅ seed: #XXXXXXXX` with a **Verify** button. On desktop it appears under the leaderboard in the side panel. On mobile it appears in a fixed footer and in the result panel.

### Engine v9 — Mechanical Collision Physics

All ball deaths now trigger a proper mechanical bounce impulse on the surviving ball:

- Direction: along the collision normal (away from the dead ball)
- Speed: reset to `CONFIG.SPEED`
- Dispersion: random angle applied via `randomizeBounce()`

Previously only special+special collisions had this behavior. Now all collision types (special kills normal, normal kills normal) produce the same physical response.

### Mobile Responsive Improvements

- Stats modal accessible via 📊 button (desktop stat panel hidden on mobile)
- Progressive multiplier shown inline in nick row on mobile: `🎮 NitroBlинчик   P:4  T:2`
- Fixed footer with Verify and Copy Replay after each game
- Result panel closes only on background tap or ✕ button — no accidental dismissal
- Clipboard fallback via `execCommand` for browsers that block `navigator.clipboard`
- All scrollbars hidden globally

### Desktop Improvements

- Seed / Verify / Copy Replay moved under leaderboard in side panel
- INFO button styled: white text on blue background
- Empty leaderboard div hidden (was showing as a mysterious green bar)
- Duplicate Firebase SDK includes removed

---

## 🚀 v6.1 Release — The League Is Open!

Ball Rush League is live! A physics-based arcade slot where balls bounce around a football field, scoring goals in corner pockets. But this isn't your typical slot — there's no reels, no paylines. Just pure physics and strategy.

### What Makes It Different

Every ball has a life of its own. Normal balls spawn with value 9 and slowly lose it over time — unless they pass through the center zone, which recharges them back to full. Then there are the special ones:

🥇 **Golden balls** — never lose value, carry a ×3 multiplier, and you can spot them by the spinning ring of light around them.

💣 **Explosive balls** — never lose value either, but when they score a goal, they detonate everything in the upper half of the field. Every destroyed ball pays out. Chain reactions happen.

The **progressive multiplier** grows with each goal and can reach ×5. But five timeouts in a row and it resets. Risk and reward.

### The League

This isn't just a single-player game anymore. Ball Rush League has a **weekly leaderboard** powered by Firebase. Your best RTP (Return to Player) gets recorded — play at least 500 balls to qualify. Same RTP? The player who fired more balls takes the lead. New rankings every week.

Pick your randomly generated nickname — NitroBlинчик, CosmicOwl, 雷霆猫咪 — and climb the board.

### 5 Languages, One Game

English, Russian, German, Portuguese, Chinese. Everything translates — UI, stats panel, game rules, nicknames. Switch languages on the start screen with flag buttons.

### Sound Design

Three distinct audio signatures for goals:
- Normal goals get a crowd cheer
- Golden goals trigger a sparkle arpeggio rising through a major chord
- Explosive goals hit with a deep boom, noise burst, and sub-bass rumble

Background ambient crowd noise loops during gameplay.

### Under The Hood

The physics engine runs deterministic simulation with seeded RNG (Java-compatible). Every game can be replayed with a seed URL — share your lucky run with friends. The math has been verified across 400 million simulated spins.

### What's Next

- More special ball types
- Tournament mode
- Achievement system

⚽ **Ball Rush League** — https://constarik.github.io/BallRushLeague/
