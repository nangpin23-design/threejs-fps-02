// Rounds: buy phase, live round, plant/defuse, win conditions and the
// economy. One object owns the whole match state; main.js reads it every
// frame and the HUD renders it. First team to 5 round wins takes the match.
export function createRounds(world, bots, events) {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'end'
    round: 1,
    timer: 12,
    buyTime: 12,
    roundTime: 100,
    score: { vanguard: 0, sentinel: 0 },
    money: 800,
    planted: null, // { site, at, by }
    plantTimer: 45,
    defuse: null, // { at, by }
    plantProgress: 0,
    defuseProgress: 0,
    winner: null,
    reason: '',
    matchOver: false,
    matchWinner: null,
  };
  let endTimer = 0;
  let lastTickSecond = -1;

  function startBuy() {
    state.phase = 'buy';
    state.timer = state.buyTime;
    state.planted = null;
    state.defuse = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.winner = null;
    state.reason = '';
    events.onPhase('buy');
  }
  function startLive() {
    state.phase = 'live';
    state.timer = state.roundTime;
    events.onPhase('live');
  }
  function endRound(winner, reason) {
    if (state.phase === 'end') return;
    state.phase = 'end';
    state.winner = winner;
    state.reason = reason;
    state.score[winner] += 1;
    state.money += winner === 'vanguard' ? 400 : 200;
    endTimer = 4.5;
    events.onRoundEnd(winner, reason, state.score);
    if (state.score[winner] >= 5) {
      state.matchOver = true;
      state.matchWinner = winner;
    }
  }
  function nextRound() {
    state.round += 1;
    bots.resetRound();
    bots.placeAtSpawns();
    events.onNextRound(state.round);
    startBuy();
  }

  return {
    state,
    startBuy,
    startLive,
    endRound,
    earn(amount) { state.money += amount; },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    plant(site, by) {
      state.planted = { site, at: 0, by };
      state.plantTimer = 45;
      events.onPlant(site);
    },
    step(dt, ctx) {
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) startLive();
        return;
      }
      if (state.phase === 'end') {
        endTimer -= dt;
        if (endTimer <= 0 && !state.matchOver) nextRound();
        return;
      }
      // live
      state.timer -= dt;
      const second = Math.ceil(state.timer);
      if (second !== lastTickSecond) {
        lastTickSecond = second;
        if (second <= 5 && second > 0) events.onTick();
      }
      if (state.planted) {
        state.plantTimer -= dt;
        if (state.plantTimer <= 0) {
          endRound('vanguard', 'Charge detonated');
          return;
        }
      }
      if (state.timer <= 0) {
        if (state.planted) {
          // Timer out with a live charge: the round plays on until it blows or is defused.
          state.timer = 0;
        } else {
          endRound('sentinel', 'Time expired — site held');
          return;
        }
      }
      // Elimination check (bots + player via ctx).
      const vanguardAlive = bots.aliveCount('vanguard') + (ctx.playerAlive ? 1 : 0);
      const sentinelAlive = bots.aliveCount('sentinel');
      if (vanguardAlive === 0) { endRound('sentinel', 'Vanguard eliminated'); return; }
      if (sentinelAlive === 0) {
        if (state.planted) {
          // Defenders dead but the charge is live: it still blows.
          if (state.plantTimer > 0) return;
        }
        endRound('vanguard', 'Sentinels eliminated');
      }
    },
    // Plant / defuse channelling, driven by main.js while E is held.
    channelPlant(dt, nearSite, holding) {
      if (state.phase !== 'live' || state.planted) { state.plantProgress = 0; return false; }
      if (!nearSite || !holding) { state.plantProgress = Math.max(0, state.plantProgress - dt * 2); return false; }
      state.plantProgress += dt / 3;
      if (state.plantProgress >= 1) {
        this.plant(nearSite, 'player');
        state.plantProgress = 0;
        return true;
      }
      return false;
    },
    channelDefuse(dt, nearSite, holding) {
      if (state.phase !== 'live' || !state.planted || state.planted.site !== nearSite) { state.defuseProgress = 0; return false; }
      if (!holding) { state.defuseProgress = Math.max(0, state.defuseProgress - dt * 2); return false; }
      state.defuseProgress += dt / 5;
      if (state.defuseProgress >= 1) {
        state.planted = null;
        state.defuseProgress = 0;
        events.onDefuse();
        this.endRound('sentinel', 'Charge defused');
        return true;
      }
      return false;
    },
  };
}
