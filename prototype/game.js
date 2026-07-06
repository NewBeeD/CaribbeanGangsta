/* Caribbean Gangsta — first-session prototype logic
 * Implements the first-session flow (doc 07 §7) + a working Deal screen
 * (doc 07 §1), with economy numbers from doc 01 and telemetry from doc 06.
 *
 * Design fidelity notes (why the code does what it does):
 *  - Displayed bust odds EXACTLY equal the rolled probability (Sid Meier fairness).
 *  - Losses are sequenced AFTER wins: the guided first sale + first heat scare are
 *    guaranteed survivals; real risk only starts once competence is established.
 *  - Failure renders as a SCENE, never an error toast (text-based games finding).
 *  - Session ends on an OPEN LOOP: a buyer waiting + income accruing (return hook).
 *  - No punishment for absence: idle income only ever adds, never subtracts.
 *  - Progressive disclosure: nav/systems unlock step by step, not up front.
 */

(() => {
  'use strict';

  // ---- Economy constants (doc 01) ----
  const PRODUCTS = {
    weed: { name: 'WEED',    buy: 10,  sell: 18,  heat: 0.1, vol: 0.20 },
    coke: { name: 'COCAINE', buy: 200, sell: 480, heat: 1.0, vol: 0.35 },
  };
  const BUST_MIN = 0.03, BUST_MAX = 0.60;   // clamp (doc 01 §2)
  const FRONT_BASE_RATE = 2100;             // clean $/h at lvl 1 (Neon Club, doc 01)
  const IDLE_DEMO_MULT = 3600 / 8;          // accelerate: 1 real sec ≈ 7.5 "game min" so idle is visible

  // ---- State ----
  const S = {
    dirty: 0, clean: 0,
    hold: { weed: 0, coke: 0 },
    heat: 0.15,                 // 0..1
    deals: 0, busts: 0,
    frontRate: 0,               // clean $/h once a front is open
    phase: 'coldOpen',
    freeDealsThisPhase: 0,
    market: {},                 // current shown prices
    sessionStart: Date.now(),
    lastIdleTick: Date.now(),
    hiredRunner: false,
    navUnlocked: false,
  };

  // ---- Elements ----
  const $ = (id) => document.getElementById(id);
  const screen = $('screen');
  const statusbar = $('statusbar');
  const bottomnav = $('bottomnav');

  // ---- Telemetry (doc 06) ----
  function log(msg, kind) {
    const row = document.createElement('div');
    row.className = kind || 'ev';
    const t = ((Date.now() - S.sessionStart) / 1000).toFixed(0).padStart(3, '0');
    row.textContent = `[${t}s] ${msg}`;
    const box = $('telLog');
    box.prepend(row);
  }
  function telemetry() {
    $('telTime').textContent = ((Date.now() - S.sessionStart) / 1000).toFixed(0) + 's';
    $('telScreen').textContent = S.phase;
    $('telDeals').textContent = S.deals;
    $('telBusts').textContent = S.busts;
    $('telIdle').textContent = Math.round(S.frontRate);
  }
  setInterval(telemetry, 500);

  // ---- Idle engine (doc 06): only ever ADDS clean cash ----
  setInterval(() => {
    if (S.frontRate > 0) {
      const dtHours = ((Date.now() - S.lastIdleTick) / 1000) * IDLE_DEMO_MULT / 3600;
      S.clean += S.frontRate * dtHours;
      S.lastIdleTick = Date.now();
      // Live-tick just the accrual number (don't re-render — would drop button handlers)
      if (S.phase === 'sessionEnd') {
        const el = $('accrue');
        if (el) el.textContent = money(S.clean) + ' clean';
      }
    } else {
      S.lastIdleTick = Date.now();
    }
  }, 1000);

  const money = (n) => '$' + Math.round(n).toLocaleString();
  const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  const heatDots = () => {
    const lit = Math.max(0, Math.min(3, Math.round(S.heat * 3)));
    return 'HEAT ' + '▪'.repeat(lit) + '▫'.repeat(3 - lit);
  };
  function refreshStatus() {
    $('heatDots').textContent = heatDots();
  }

  // ======================================================================
  //  FLOW  — each function renders one beat/screen
  // ======================================================================

  // ---- Beat: Cold open (Story Card ONB-01, doc 08) ----
  function renderColdOpen() {
    S.phase = 'coldOpen';
    statusbar.classList.add('hidden');
    bottomnav.classList.add('hidden');
    screen.innerHTML = `
      <p class="kicker">Case № 0007 · Subject: you</p>
      <h1 class="scene-title">Caribbean<br>Gangsta</h1>
      <p class="hint" style="margin-bottom:20px">Rise of the Drug Lord — first-session prototype</p>
      <div class="scene">
        <span class="who">Auntie Pearl</span> doesn't look up from her fruit stall.
        "You want to eat in this town, you learn to move things quiet." She slides a
        folded cloth across the crate. "Somebody down the way is buying. Don't make
        it a story."
      </div>
      <p class="hint">Your goal: build an empire. First — make one sale.</p>
      <button class="primary" id="go">Take the cloth</button>
    `;
    $('go').onclick = () => {
      S.hold.weed = 8;                 // Pearl fronts you product
      log('onboarding: cold open done');
      renderGuidedSell();
    };
    log('session start');
  }

  // ---- Beat: First guided sell (guaranteed success — win before risk) ----
  function renderGuidedSell() {
    S.phase = 'guidedSell';
    statusbar.classList.remove('hidden');
    refreshStatus();
    screen.innerHTML = `
      <p class="kicker">Exhibit A · The first move</p>
      <div class="card">
        <div class="label">The Deal — Kingston Docks</div>
        <div class="row"><span class="big">Weed <span class="trend up">▲</span></span>
          <span class="gold">${money(PRODUCTS.weed.sell)}/unit</span></div>
        <div class="leader"><span class="dim">You hold</span><span class="fill"></span><span>${S.hold.weed} units</span></div>
        <div class="leader"><span class="dim">Clean chance</span><span class="fill"></span><span class="green">100%</span></div>
      </div>
      <p class="hint">Tap to sell. One sale, guaranteed. Learn by doing.</p>
      <button class="primary" id="sell">Make the sell</button>
    `;
    $('sell').onclick = () => {
      const gain = S.hold.weed * PRODUCTS.weed.sell;
      S.dirty += gain; S.hold.weed = 0; S.deals++;
      log('onboarding: first sale complete (+' + money(gain) + ')');
      screen.innerHTML = `
        <div class="scene win">The buyer counts it twice, nods, and is gone before
          you've pocketed the cash. <span class="gold">+${money(gain)}</span> dirty.</div>
        <p class="hint">That's the loop: move product, get paid.</p>
        <button class="primary" id="next">Keep working</button>`;
      $('next').onclick = () => { S.phase = 'freePlay'; S.freeDealsThisPhase = 0; renderDeal(); };
    };
  }

  // ---- Screen: The Deal (free play hub, doc 07 §1) ----
  function rollMarket(prodKey) {
    const p = PRODUCTS[prodKey];
    const swing = (Math.random() * 2 - 1) * p.vol;      // ±vol
    const price = Math.max(1, Math.round(p.sell * (1 + swing)));
    const trend = swing >= 0 ? 'up' : 'down';
    S.market[prodKey] = { price, trend };
    return S.market[prodKey];
  }

  // Bust probability — the number shown IS the number rolled (fairness)
  function bustChance(prodKey) {
    const p = PRODUCTS[prodKey];
    const raw = 0.05 + S.heat * 0.4 + p.heat * 0.08;
    return Math.min(BUST_MAX, Math.max(BUST_MIN, raw));
  }

  function renderDeal() {
    S.phase = S.phase === 'freePlay' ? 'freePlay' : S.phase;
    statusbar.classList.remove('hidden');
    refreshStatus();
    unlockNav();

    const prodKey = S.dirty >= PRODUCTS.coke.buy && S.deals >= 4 ? 'coke' : 'weed';
    const p = PRODUCTS[prodKey];
    const m = S.market[prodKey] || rollMarket(prodKey);
    const chance = bustChance(prodKey);
    const cleanPct = Math.round((1 - chance) * 100);
    const have = S.hold[prodKey];
    const canBuy = Math.floor(S.dirty / p.buy);
    S._dealQty = Math.min(S._dealQty || 1, Math.max(1, have || canBuy || 1));

    // Story nudge banner (session-end hook / next beat)
    const nudge = storyNudge();

    screen.innerHTML = `
      ${nudge}
      <div class="card">
        <div class="label">The Deal</div>
        <div class="row" style="margin-bottom:10px">
          <span class="big">${titleCase(p.name)} <span class="trend ${m.trend}">${m.trend === 'up' ? '▲' : '▼'}</span></span>
          <span class="gold big">${money(m.price)}</span>
        </div>
        <div class="leader"><span class="dim">Buy price</span><span class="fill"></span><span>${money(p.buy)}</span></div>
        <div class="leader"><span class="dim">You hold</span><span class="fill"></span><span>${have} units</span></div>
        <div class="leader"><span class="dim">Dirty cash</span><span class="fill"></span><span class="gold">${money(S.dirty)}</span></div>
      </div>

      <div class="card">
        <div class="label">Risk this run</div>
        <div class="row" style="align-items:center">
          <span class="dim">Clean chance</span>
          <span class="big ${cleanPct >= 70 ? 'green' : 'red'}">${cleanPct}%</span>
        </div>
        <div class="meter"><i style="width:${cleanPct}%"></i></div>
        <div class="hint" style="margin:10px 0 0">If busted — lose the product + some cash. Odds shown are the real odds.</div>
      </div>

      <div class="stepper">
        <button id="minus">−</button>
        <span class="qty" id="qty">${S._dealQty} units</span>
        <button id="plus">+</button>
      </div>

      <div style="display:flex; gap:10px; margin-bottom:6px">
        <button class="choice" id="buy" style="text-align:center; margin:0; flex:1; border-left-width:1px">Buy ${money(p.buy)}</button>
        <button class="primary" id="sell" style="flex:2; margin:0">Make the sell</button>
      </div>
    `;

    const clampQty = () => {
      const max = Math.max(1, have || canBuy || 1);
      S._dealQty = Math.min(Math.max(1, S._dealQty), max);
      $('qty').textContent = S._dealQty + ' units';
    };
    $('minus').onclick = () => { S._dealQty--; clampQty(); };
    $('plus').onclick  = () => { S._dealQty++; clampQty(); };

    $('buy').onclick = () => {
      const cost = S._dealQty * p.buy;
      if (cost > S.dirty) { flashHint('Not enough cash'); return; }
      S.dirty -= cost; S.hold[prodKey] += S._dealQty;
      log(`bought ${S._dealQty} ${prodKey} (−${money(cost)})`);
      renderDeal();
    };

    $('sell').onclick = () => {
      if (have <= 0) { flashHint('Buy product first'); return; }
      const qty = Math.min(S._dealQty, have);
      resolveSell(prodKey, qty, m.price, chance);
    };
  }

  function resolveSell(prodKey, qty, price, chance) {
    const busted = Math.random() < chance;      // rolled against the DISPLAYED number
    S.deals++;
    S.heat = Math.min(1, S.heat + PRODUCTS[prodKey].heat * 0.02 * qty);

    if (busted) {
      S.busts++;
      const lostCash = Math.round(S.dirty * 0.15);
      S.dirty -= lostCash; S.hold[prodKey] -= qty;
      log(`BUST on ${prodKey} (−${money(lostCash)} + product)`, 'warn');
      screen.innerHTML = `
        <div class="scene bust">Blue lights hit the alley before the deal closed.
          You ran; the product didn't. Lost the ${prodKey} and
          <span class="red">${money(lostCash)}</span> shaking off the tail.</div>
        <p class="hint">A busted deal is a scene, not a game over.</p>
        <button class="primary" id="next">Shake it off</button>`;
      $('next').onclick = advanceOrDeal;
    } else {
      const gain = qty * price;
      S.dirty += gain; S.hold[prodKey] -= qty;
      log(`sold ${qty} ${prodKey} (+${money(gain)})`);
      screen.innerHTML = `
        <div class="scene win">Quick handshake, folded bills, gone.
          <span class="gold">+${money(gain)}</span> dirty.</div>
        <button class="primary" id="next">Keep working</button>`;
      $('next').onclick = advanceOrDeal;
    }
  }

  // Advance the first-session script once enough competence is shown, else keep dealing
  function advanceOrDeal() {
    S.freeDealsThisPhase++;
    refreshStatus();
    if (S.phase === 'freePlay' && S.freeDealsThisPhase >= 2 && !S._heatScareDone) {
      return renderHeatScare();
    }
    if (S.phase === 'postScare' && !S.hiredRunner) {
      return renderHireRunner();
    }
    if (S.phase === 'postRunner' && S.frontRate === 0) {
      return renderOpenFront();
    }
    renderDeal();
  }

  // ---- Beat: First heat scare (guaranteed survival — win before real risk) ----
  function renderHeatScare() {
    S.phase = 'heatScare';
    S._heatScareDone = true;
    S.heat = Math.min(1, S.heat + 0.25);
    refreshStatus();
    log('event: first heat scare (survivable)');
    screen.innerHTML = `
      <div class="scene">A patrol car rolls the block twice, slow. Your runner
        clocks it. "We good?" Heat's rising — but you know these streets better
        than they do.</div>
      <p class="hint">Lie low to cool the heat. No cost but a beat of patience.</p>
      <button class="primary" id="low">Lie low, let it pass</button>
    `;
    $('low').onclick = () => {
      S.heat = Math.max(0.1, S.heat - 0.2);
      refreshStatus();
      log('heat scare survived (heat cooled)');
      screen.innerHTML = `
        <div class="scene win">You melt into the market crowd. The car moves on.
          That's the game — knowing when <em>not</em> to move.</div>
        <button class="primary" id="next">Back to business</button>`;
      $('next').onclick = () => { S.phase = 'postScare'; S.freeDealsThisPhase = 0; renderDeal(); };
    };
  }

  // ---- Beat: Hire first runner (relatedness seed — Story Card, doc 08) ----
  function renderHireRunner() {
    S.phase = 'hireRunner';
    screen.innerHTML = `
      <div class="scene"><span class="who">Deon</span> has been hanging around your
        corners for a week, watching how you work. "I'm faster than whoever you got
        now," he says. "And I don't talk." He means it.</div>
      <button class="choice" id="hire">Put him on. <small>He'll owe you — and remember it.</small></button>
      <button class="choice" id="wait">Not yet. <small>Keep it just you for now.</small></button>
    `;
    $('hire').onclick = () => {
      S.hiredRunner = true;
      $('crewNav') && ($('crewNav').disabled = false);
      enableNav('crew');
      log('crew: hired Deon (runner)');
      screen.innerHTML = `
        <div class="scene win">Deon pockets his first cut like it's the first money
          he's ever earned clean-feeling. He nods once. You've got a crew now.</div>
        <button class="primary" id="next">Grow the operation</button>`;
      $('next').onclick = () => { S.phase = 'postRunner'; renderOpenFront(); };
    };
    $('wait').onclick = () => { S.phase = 'postRunner'; S.freeDealsThisPhase = 0; renderDeal(); };
  }

  // ---- Beat: Open first laundering front (idle engine starts, doc 06) ----
  function renderOpenFront() {
    S.phase = 'openFront';
    const cost = 5000;
    const afford = S.dirty >= cost;
    screen.innerHTML = `
      <div class="scene">Auntie Pearl again: "Cash you can't explain is cash you
        can't spend. Buy something with a till." She taps a flyer: a rundown car
        wash, going cheap.</div>
      <div class="card">
        <div class="label">First front — Car Wash</div>
        <div class="row"><span>Cost</span><span class="gold">${money(cost)}</span> dirty</div>
        <div class="row"><span>Cleans</span><span class="green">${money(FRONT_BASE_RATE)}/h</span> while you're away</div>
      </div>
      ${afford
        ? `<button class="primary" id="buy">Buy the car wash</button>`
        : `<p class="hint">Need ${money(cost)} dirty. Make a few more deals first.</p>
           <button class="primary" id="back">Back to dealing</button>`}
    `;
    if (afford) {
      $('buy').onclick = () => {
        S.dirty -= cost; S.frontRate = FRONT_BASE_RATE; S.lastIdleTick = Date.now();
        enableNav('money');
        log('money: first front opened — idle engine online');
        renderSessionEnd();
      };
    } else {
      $('back').onclick = () => { S.phase = 'postRunner'; renderDeal(); };
    }
  }

  // ---- Beat: SESSION-END HOOK (open loop + accruing income → return reason) ----
  function renderSessionEnd() {
    const firstTime = S.phase !== 'sessionEnd';
    S.phase = 'sessionEnd';
    if (firstTime) log('SESSION-END hook reached (open loop + idle accruing)');
    const mins = Math.max(1, Math.round((Date.now() - S.sessionStart) / 60000));
    screen.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px">
        <div><p class="kicker" style="margin-bottom:2px">End of report</p>
          <h1 class="scene-title">Day One</h1></div>
        <span class="stamp">FILED</span>
      </div>
      <div class="card">
        <div class="label">Your empire — while you're away</div>
        <div class="leader"><span class="dim">Car wash cleaning</span><span class="fill"></span><span class="green" id="accrue">${money(S.clean)} clean</span></div>
        <div class="leader"><span class="dim">Rate</span><span class="fill"></span><span>${money(S.frontRate)}/h</span></div>
      </div>
      <div class="card">
        <div class="label">Open threads</div>
        <div class="row"><span>➜ A buyer wants a bigger order.</span><span class="dim">tomorrow</span></div>
        <div class="row"><span>➜ Someone's asking about your corners…</span><span class="red">Silvio?</span></div>
      </div>
      <p class="hint">You'll come back to money earned and decisions waiting.
        That's the hook — nothing here punishes you for leaving.</p>
      <button class="primary" id="loop">Play the day again</button>
      <p class="hint" style="text-align:center;margin-top:14px">
        First session ≈ ${mins} min · target 10–20 (doc 09)</p>
    `;
    $('loop').onclick = () => resetSession();
  }

  // ======================================================================
  //  Helpers
  // ======================================================================
  function storyNudge() {
    if (S.phase === 'freePlay' && !S._heatScareDone)
      return `<div class="card"><div class="label">Goal</div>Make a couple of deals — build your bankroll.</div>`;
    if (S.phase === 'postScare' && !S.hiredRunner)
      return `<div class="card"><div class="label">Goal</div>You're moving weight solo. Time for a crew.</div>`;
    if (S.phase === 'postRunner' && S.frontRate === 0)
      return `<div class="card"><div class="label">Goal</div>Get to ${money(5000)} dirty — then buy a front to clean it.</div>`;
    return '';
  }

  function flashHint(msg) {
    const h = document.createElement('p');
    h.className = 'hint red';
    h.textContent = msg;
    screen.appendChild(h);
    setTimeout(() => h.remove(), 1400);
  }

  // Progressive disclosure of the bottom nav
  function unlockNav() {
    if (!S.navUnlocked) {
      S.navUnlocked = true;
      bottomnav.classList.remove('hidden');
      log('ui: bottom nav unlocked (Deals)');
    }
  }
  function enableNav(name) {
    const btn = bottomnav.querySelector(`[data-nav="${name}"]`);
    if (btn && btn.disabled) { btn.disabled = false; log('ui: ' + name + ' tab unlocked'); }
  }

  function resetSession() {
    const keepLog = $('telLog').innerHTML;
    Object.assign(S, {
      dirty: 0, clean: 0, hold: { weed: 0, coke: 0 }, heat: 0.15,
      deals: 0, busts: 0, frontRate: 0, phase: 'coldOpen', freeDealsThisPhase: 0,
      market: {}, sessionStart: Date.now(), lastIdleTick: Date.now(),
      hiredRunner: false, navUnlocked: false, _heatScareDone: false, _dealQty: 1,
    });
    bottomnav.querySelectorAll('button').forEach((b, i) => b.disabled = i !== 0);
    $('telLog').innerHTML = keepLog;
    log('— session reset —');
    renderColdOpen();
  }

  // ---- Nav + telemetry wiring ----
  bottomnav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]');
    if (!b || b.disabled) return;
    bottomnav.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if (b.dataset.nav === 'deal')  renderDeal();
    if (b.dataset.nav === 'money') renderSessionEnd();
    if (b.dataset.nav === 'crew')  renderCrewPeek();
    if (b.dataset.nav === 'heat')  renderHeatPeek();
  });

  function renderCrewPeek() {
    S.phase = 'crewPeek';
    screen.innerHTML = `
      <h1 class="scene-title">CREW</h1>
      <div class="card">
        <div class="row"><b>Deon</b><span class="dim">Runner</span></div>
        <div class="dim">"Owes you his life. Won't forget it."</div>
      </div>
      <p class="hint">Loyalty shows as behaviour, not a bar (doc 02).</p>
      <button class="primary" id="back">Back to deals</button>`;
    $('back').onclick = renderDeal;
  }
  function renderHeatPeek() {
    S.phase = 'heatPeek';
    const pct = Math.round(S.heat * 100);
    screen.innerHTML = `
      <h1 class="scene-title">HEAT & THREATS</h1>
      <div class="card">
        <div class="label">Current attention</div>
        <div class="meter"><i style="width:${pct}%; background:var(--red)"></i></div>
        <div class="dim" style="margin-top:8px">Decays as you lie low.</div>
      </div>
      <button class="primary" id="back">Back to deals</button>`;
    $('back').onclick = renderDeal;
  }

  // ---- Telemetry drawer toggle ----
  $('telToggle').onclick = () => $('telBody').classList.toggle('hidden');
  $('telReset').onclick = resetSession;
  $('backBtn').onclick = () => { if (S.navUnlocked) renderDeal(); };

  // ---- Boot ----
  renderColdOpen();
})();
