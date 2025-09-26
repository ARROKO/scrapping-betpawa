require('dotenv').config();
const puppeteer = require('puppeteer');
const readline = require('readline');

// Config test
const DO_SCREENSHOT = false; // stop screenshots per user request
const MAX_INTERLEAVED_SELECT = 200; // allow selecting throughout scroll

// Test URL for Football Double Chance (DC)
const TEST_URL = 'https://www.betpawa.cm/events?marketId=DC&categoryId=2';

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function run() {
  // Interaction utilisateur: cible de cote totale et limite par sélection
  const ask = (q) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (ans) => { rl.close(); resolve(ans.trim()); });
  });
  const interactive = process.env.NON_INTERACTIVE !== '1';

  let targetCote = parseFloat(((process.env.TARGET_COTE || '') + '').replace(',', '.'));
  if (interactive || !targetCote || isNaN(targetCote) || targetCote < 2) {
    targetCote = 0;
    while (!targetCote || isNaN(targetCote) || targetCote < 2) {
      const input = await ask('🎯 Cote totale à atteindre (ex: 10) : ');
      targetCote = parseFloat((input || '').replace(',', '.'));
      if (!targetCote || isNaN(targetCote) || targetCote < 2) {
        console.log("❌ Entrez un nombre valide ≥ 2");
      }
    }
  }

  // ——————————————————————————————————————————————————————————
  // Choix du marché (en amont)
  console.log('\n' + '═'.repeat(50));
  console.log('🎯 Configuration du marché');
  console.log('1) DC — Double Chance (1X, X2, 12)');
  console.log('2) P/M — Plus / Moins (Over / Under)');
  console.log('═'.repeat(50));
  let marketChoice = '1';
  if (interactive) {
    const marketInput = await ask('👉 Votre choix (1 ou 2) : ');
    if (marketInput === '2') marketChoice = '2';
  } else {
    const envMarket = (process.env.MARKET_ID || '').toUpperCase();
    marketChoice = envMarket === 'P/M' ? '2' : '1';
  }

  // ——————————————————————————————————————————————————————————
  // Login & mise (console)
  let useAutoLogin = true;
  if (interactive) {
    console.log('\n' + '═'.repeat(50));
    console.log('🔐 Connexion');
    console.log('1) Connexion automatique (.env)');
    console.log('2) Connexion manuelle (je me connecte moi-même)');
    console.log('═'.repeat(50));
    const loginChoice = await ask('👉 Votre choix (1 ou 2) : ');
    if (loginChoice === '2') useAutoLogin = false;
  } else {
    const v = (process.env.AUTO_LOGIN || '1').toLowerCase();
    useAutoLogin = v === '1' || v === 'true' || v === 'yes' || v === 'o';
  }

  let placementAuto = false;
  let stakeAmount = 0;
  if (interactive) {
    console.log('\n' + '═'.repeat(50));
    console.log('🎰 Placement de mise');
    console.log('═'.repeat(50));
    const placeAutoInput = await ask('Placer automatiquement après avoir atteint la cible ? (o/n) : ');
    if ((placeAutoInput || '').toLowerCase().startsWith('o')) placementAuto = true;
    if (placementAuto) {
      const stakeIn = await ask('💰 Montant de la mise (ex: 500) : ');
      const parsedStake = parseFloat((stakeIn || '').replace(',', '.'));
      stakeAmount = !isNaN(parsedStake) && parsedStake > 0 ? parsedStake : 0;
    }
  } else {
    // API mode: always place bet automatically at the end
    placementAuto = true;
    stakeAmount = parseFloat(((process.env.STAKE_AMOUNT || '') + '').replace(',', '.'));
    if (!stakeAmount || isNaN(stakeAmount) || stakeAmount <= 0) {
      stakeAmount = 1; // sensible default
    }
  }

  // Déterminer l’URL en fonction du marché
  // DC: marketId=DC ; P/M (Over/Under): marketId=P/M
  const MARKET_ID = marketChoice === '2' ? 'P/M' : 'DC';
  const targetUrl = `https://www.betpawa.cm/events?marketId=${MARKET_ID}&categoryId=2`;

  // ——————————————————————————————————————————————————————————
  // Mode aléatoire (échantillonnage d'évènements non séquentiel)
  let randomMode = false;
  let randomSkipRate = 0.5;
  if (interactive) {
    console.log('\n' + '═'.repeat(50));
    console.log('🎛️ Mode d\'échantillonnage des matchs');
    console.log('• Normal: traite les matchs dans l\'ordre d\'affichage');
    console.log('• Aléatoire: saute des matchs au hasard pour éviter l\'ordre strict');
    console.log('═'.repeat(50));
    const rndInput = await ask('Activer la sélection aléatoire des matchs ? (o/n) : ');
    if ((rndInput || '').trim().toLowerCase().startsWith('o')) randomMode = true;
  } else {
    const v = (process.env.RANDOM_MODE || '0').toLowerCase();
    randomMode = v === '1' || v === 'true' || v === 'yes' || v === 'o';
    const rs = parseFloat(process.env.RANDOM_SKIP_RATE || '0.5');
    if (!isNaN(rs) && rs >= 0 && rs <= 1) randomSkipRate = rs;
  }

  // ——————————————————————————————————————————————————————————
  // Paramètres spécifiques P/M (Over/Under)
  let ouTargetLine = 2.5;
  let ouPriority = 'over'; // 'over' | 'under'
  if (MARKET_ID === 'P/M') {
    if (interactive) {
      console.log('\n' + '═'.repeat(50));
      console.log('⚙️  Paramètres P/M (Over/Under)');
      console.log('Exemples de lignes: 0.5, 1.5, 2.5, 3.5, 4.5, 5.5');
      console.log('═'.repeat(50));
      const lineInput = await ask('Ligne P/M cible (ex: 2.5) : ');
      const parsedLine = parseFloat((lineInput || '').replace(',', '.'));
      if (!isNaN(parsedLine) && parsedLine >= 0.5) ouTargetLine = parsedLine;
      const ouPref = await ask('Priorité de côté (1=Over/Plus d\'abord, 2=Under/Moins d\'abord) : ');
      if (ouPref === '2') ouPriority = 'under';
    } else {
      const parsedLine = parseFloat(((process.env.OU_LINE || '') + '').replace(',', '.'));
      if (!isNaN(parsedLine) && parsedLine >= 0.5) ouTargetLine = parsedLine;
      const pr = (process.env.OU_PRIORITY || 'over').toLowerCase();
      ouPriority = pr === 'under' ? 'under' : 'over';
    }
  }

  // ——————————————————————————————————————————————————————————
  // Limite de cote par sélection
  let maxOddPerSelection = Infinity;
  if (interactive) {
    const maxInput = await ask('⚖️ Limite de cote par sélection (ex: 2.0) ou ENTER pour aucune limite : ');
    if (maxInput) {
      const parsed = parseFloat(maxInput.replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 1.01) maxOddPerSelection = parsed;
    }
  } else {
    const v = parseFloat(((process.env.MAX_ODD_PER_SELECTION || '') + '').replace(',', '.'));
    if (!isNaN(v) && v >= 1.01) maxOddPerSelection = v;
  }

  // Mode de sélection (DC uniquement)
  // 1=Priorité (1X>X2>12), 2=Plus petite cote admissible, 3=Rotation
  let selectionMode = 'priority'; // 'priority' | 'min' | 'round'
  if (MARKET_ID !== 'P/M') {
    if (interactive) {
      const modeInput = await ask('🎛️ Mode de choix (1=Priorité 1X>X2>12, 2=Plus petite cote, 3=Rotation 1X, puis X2, puis 12) : ');
      if (modeInput === '2') selectionMode = 'min';
      else if (modeInput === '3') selectionMode = 'round';
    } else {
      const sm = (process.env.SELECTION_MODE || 'priority').toLowerCase();
      if (['priority','min','round'].includes(sm)) selectionMode = sm;
    }
  }

  // Petit récap de config
  console.log('\n' + '➤'.repeat(20));
  console.log(`Marché: ${marketChoice === '2' ? 'P/M (Over/Under)' : 'DC (Double Chance)'}`);
  if (MARKET_ID !== 'P/M') {
    console.log(`Mode de sélection: ${selectionMode}`);
  }
  console.log(`Mode aléatoire: ${randomMode ? `ON (skip≈${Math.round(randomSkipRate*100)}%)` : 'OFF'}`);
  if (MARKET_ID === 'P/M') {
    console.log(`P/M — Ligne: ${ouTargetLine} | Priorité: ${ouPriority.toUpperCase()}`);
  }
  console.log(''.padEnd(20, '➤'));

  let currentTotal = 1.0;
  let reachedTarget = false;

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1366, height: 820 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
      // reduce background throttling when window not focused/occluded
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion'
    ],
    slowMo: 50,
    // Persist session to avoid frequent logins / cooldowns
    userDataDir: process.env.PAWA_PROFILE_DIR || './.pawa-profile',
  });

  const page = await browser.newPage();
  try { await page.bringToFront(); } catch (_) {}

  try {
    // Helpers login & solde & placement
    async function waitForBalance(page, timeoutMs = 20000) {
      try {
        await page.waitForFunction(() => {
          return document.querySelector('span.button.balance') !== null ||
                 document.querySelector('.balance-amount') !== null ||
                 document.querySelector('.header-buttons-authenticated .button.balance') !== null;
        }, { timeout: timeoutMs });
        return true;
      } catch (_) { return false; }
    }

    async function loginAuto(page) {
      if (!process.env.COUNTRY_CODE || !process.env.PHONE_NUMBER || !process.env.PASSWORD) {
        console.log('❌ .env incomplet (COUNTRY_CODE, PHONE_NUMBER, PASSWORD)');
        return false;
      }
      try {
        await page.waitForSelector('a.button.button-accent[href="/login"]', { timeout: 15000 });
        await page.click('a.button.button-accent[href="/login"]');
        await delay(800);
        await page.waitForSelector('.country-code', { timeout: 10000 });
        await page.type('.country-code', String(process.env.COUNTRY_CODE));
        await page.waitForSelector('#login-form-phoneNumber', { timeout: 10000 });
        await page.type('#login-form-phoneNumber', String(process.env.PHONE_NUMBER));
        await page.waitForSelector('#login-form-password-input', { timeout: 10000 });
        await page.type('#login-form-password-input', String(process.env.PASSWORD));
        await page.click('input[data-test-id="logInButton"]');
        await delay(2000);
        const ok = await waitForBalance(page, 25000);
        console.log(ok ? '✅ Connexion réussie' : '❌ Connexion non confirmée');
        return ok;
      } catch (e) {
        console.log('❌ Erreur login auto:', e.message);
        return false;
      }
    }

    async function getBalance(page) {
      try {
        const val = await page.evaluate(() => {
          const selectors = [
            'span.button.balance',
            '.header-buttons-authenticated .button.balance',
            '.balance-amount'
          ];
          let el = null;
          for (const s of selectors) { el = document.querySelector(s); if (el) break; }
          if (!el) return null;
          const txt = (el.textContent || '').trim();
          const m = txt.match(/[\d,.]+/);
          if (!m) return null;
          const num = parseFloat(m[0].replace(/,/g, '.'));
          return isNaN(num) ? null : num;
        });
        return val;
      } catch (_) { return null; }
    }

    async function placeBet(page, amount) {
      try {
        // 1) Afficher le betslip si nécessaire
        try {
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, .button, [role="button"], .betslip-toggle, .betslip-button'));
            const open = btns.find(b => /betslip|coupon|panier|pari/i.test(b.className || '') || /coupon|pari|betslip/i.test((b.textContent||'')));
            if (open) open.click();
          });
          await delay(600);
        } catch (_) {}

        // 2) Cocher "Accepter les changements de cote" si présent
        try {
          await page.evaluate(() => {
            const cb = document.querySelector('#acceptAnyPrice');
            if (cb && !cb.checked) {
              const lab = document.querySelector('label[for="acceptAnyPrice"]');
              if (lab) lab.click(); else cb.click();
            }
          });
          await delay(200);
        } catch (_) {}

        // 3) Renseigner la mise dans #betslip-form-stake-input (name="stake-input")
        const typed = await page.evaluate((amt) => {
          const input = document.querySelector('#betslip-form-stake-input') || document.querySelector('input[name="stake-input"]');
          if (!input) return false;
          const val = String(amt);
          input.focus();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
          return true;
        }, amount);
        if (!typed) {
          console.log('❌ Impossible de renseigner la mise (champ introuvable)');
          return false;
        }
        await delay(700);

        // 4) Attendre que le bouton "Placer un pari" devienne actif, puis cliquer
        const btnSelector = '[data-test-id="btnPlaceBet"] input.place-bet.button-primary';
        await page.waitForSelector(btnSelector, { timeout: 8000 });
        await page.waitForFunction((sel) => {
          const btn = document.querySelector(sel);
          return !!btn && !btn.disabled;
        }, { timeout: 12000 }, btnSelector);

        // Scroll to button and click
        await page.evaluate((sel) => {
          const btn = document.querySelector(sel);
          btn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, btnSelector);
        await delay(200);
        await page.click(btnSelector);

        // 5) Attendre confirmation / vidage betslip / totalOdds ~ 1
        try {
          await page.waitForFunction(() => {
            const okMsg = Array.from(document.querySelectorAll('*')).some(n => /par(i|y) (plac|réussi)|bet placed|succès/i.test(n.textContent || ''));
            const items = document.querySelectorAll('.betslip-bet');
            const totalOdds = document.querySelector('.bet-details .bet-details-total-odds .current-value[data-test-id="totalOdds"]');
            const n = totalOdds ? parseFloat((totalOdds.textContent||'').replace(',', '.')) : 0;
            return okMsg || items.length === 0 || (n && n <= 1.05);
          }, { timeout: 20000 });
        } catch (_) {}
        return true;
      } catch (e) {
        console.log('❌ Erreur placement:', e.message);
        return false;
      }
    }

    // 1) Aller à l'accueil et se connecter selon choix (avec session persistée)
    console.log('➡️  Navigation vers: https://www.betpawa.cm');
    await page.goto('https://www.betpawa.cm', { waitUntil: 'domcontentloaded', timeout: 120000 });
    // Essayer de réutiliser la session existante (cookies/localStorage via userDataDir)
    let alreadyLogged = await waitForBalance(page, 5000);
    if (alreadyLogged) {
      console.log('🔓 Session existante détectée — connexion sautée.');
    } else if (useAutoLogin) {
      const ok = await loginAuto(page);
      if (!ok) console.log('ℹ️ Vous pouvez vous connecter manuellement si besoin.');
    } else {
      console.log('⏳ Connectez-vous manuellement (UI). Détection du solde en cours...');
      await waitForBalance(page, 120000);
    }
    const solde = await getBalance(page);
    if (solde != null) console.log(`💰 Solde détecté: ${solde}`);

    // 2) Aller vers le marché ciblé
    console.log('➡️  Navigation vers:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // Effacer le coupon de pari s'il subsiste des sélections (bouton officiel)
    try {
      await page.waitForSelector('[data-test-id="clearBetSlip"] a.underline', { timeout: 2000 });
      await page.click('[data-test-id="clearBetSlip"] a.underline');
      await delay(600);
    } catch (_) { /* bouton non présent = rien à effacer */ }

    // Helper pour lire la cote totale depuis le betslip (source de vérité UI)
    async function readTotalOdds() {
      try {
        const val = await page.evaluate(() => {
          const el = document.querySelector('.bet-details .bet-details-total-odds .current-value[data-test-id="totalOdds"]');
          if (!el) return null;
          const t = (el.textContent || '').trim().replace(',', '.');
          const n = parseFloat(t);
          return isNaN(n) ? null : n;
        });
        return val;
      } catch (_) {
        return null;
      }
    }

    // Empêcher toute navigation vers les pages /event/<id> pendant le test
    async function disableEventLinks() {
      await page.evaluate(() => {
        const scope = document.querySelector('.section-middle .scrollable-content') || document.body;
        if (!scope) return;
        const anchors = scope.querySelectorAll('a[href^="/event/"]');
        anchors.forEach(a => { a.style.pointerEvents = 'none'; });
        // Bloquer au niveau document (capture) par sécurité
        const blocker = (e) => {
          const a = e.target.closest && e.target.closest('a[href^="/event/"]');
          if (a) { e.preventDefault(); e.stopPropagation(); }
        };
        document.removeEventListener('click', blocker, true);
        document.addEventListener('click', blocker, true);
      });
    }

    async function ensureOnListing() {
      const onListing = await page.evaluate(() => location.pathname.startsWith('/events'));
      if (!onListing) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await delay(1000);
        await disableEventLinks();
      }
    }

    await disableEventLinks();

    // Essayer de fermer une éventuelle bannière cookies
    try {
      await delay(1500);
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, .button, [role="button"]'));
        const btn = candidates.find((el) => {
          const t = (el.textContent || '').toLowerCase();
          return t.includes('accepter') || t.includes('accept') || t.includes('ok') || t.includes('agree');
        });
        if (btn) btn.click();
      });
    } catch (_) {}

    // Attendre que des évènements/odds soient présents
    await delay(3000);

    // Défilement léger pour forcer le chargement
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
    await delay(1500);

    // Auto-scroll pour charger plus de matchs
    console.log('🔄 Chargement des matchs supplémentaires via auto-scroll...');
    async function loadAllEvents() {
      const MAX_LOOPS = 120;
      const IDLE_THRESHOLD = 8;
      const WAIT_MS = 1000;

      function toInt(x) { return typeof x === 'number' ? Math.floor(x) : 0; }

      let prevCount = 0;
      let idle = 0;
      let lastProcessedCount = 0; // (obsolète) — on va balayer toute la liste en s'appuyant sur processedEventIds
      const processedEventIds = new Set();
      const MAX_SELECT = MAX_INTERLEAVED_SELECT; // sélection maximum pendant le scroll
      let totalSelected = 0;
      const pickOrder = ['1x', 'x2', '12'];
      let rrIndex = 0; // round-robin index across calls
      let lastSelectedEventId = null; // pour se recentrer avant la prochaine vague de sélection

      for (let i = 0; i < MAX_LOOPS && idle < IDLE_THRESHOLD && !reachedTarget; i++) {
        await ensureOnListing();
        // Détection du bon conteneur scrollable (réel): .section-middle .scrollable-content
        const stats = await page.evaluate(() => {
          function isScrollable(el) {
            if (!el || !(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            const canScroll = ['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflow);
            return canScroll && el.scrollHeight > el.clientHeight;
          }
          const container = document.querySelector('.section-middle .scrollable-content');
          // Faire défiler vers le bas uniquement (éviter de remonter) — sans animation pour éviter le throttling
          const events = Array.from(document.querySelectorAll('.game-events-container.prematch'));
          if (container) {
            container.scrollTop = Math.min(container.scrollTop + 1200, container.scrollHeight);
          } else {
            const doc = document.scrollingElement || document.documentElement || document.body;
            doc.scrollTop = Math.min((doc.scrollTop || 0) + 1200, (doc.scrollHeight || document.body.scrollHeight));
          }
          const count = events.length;
          return { hasContainer: !!container, count };
        });

        // Scroll avec rebond
        await page.evaluate(() => {
          const container = document.querySelector('.section-middle .scrollable-content') || document.scrollingElement || document.documentElement || document.body;
          const to = container.scrollHeight || document.body.scrollHeight || document.documentElement.scrollHeight;
          if (container === (document.scrollingElement || document.documentElement || document.body)) {
            container.scrollTop = to;
          } else {
            container.scrollTop = to;
          }
          container.dispatchEvent(new Event('scroll', { bubbles: true }));
          window.dispatchEvent(new Event('scroll'));
        });

        // Attendre et mesurer
        await delay(WAIT_MS);

        // Fallback: envoyer End pour forcer le scroll global
        try { await page.keyboard.press('End'); } catch (_) {}
        await delay(300);

        // Nouvelle mesure
        await ensureOnListing();
        const count = await page.evaluate(() => document.querySelectorAll('.game-events-container.prematch').length);
        console.log(`   ➕ Chunks: ${count} (loop ${i + 1})`);
        if (count <= prevCount) idle++; else idle = 0;
        prevCount = count;

        // Intercaler la sélection pendant le scroll pour les nouveaux évènements
        if (totalSelected < MAX_SELECT && !reachedTarget) {
          await disableEventLinks();
          // Balayer toute la liste (0..count) et s'appuyer sur processedEventIds pour éviter les doublons
          let startIndex = 0;
          const endIndex = count;
          // Si on a déjà sélectionné un évènement auparavant, se recentrer dessus pour reprendre correctement
          if (lastSelectedEventId) {
            try {
              await page.evaluate((eid) => {
                const container = document.querySelector('.section-middle .scrollable-content') || document.scrollingElement || document.body;
                const link = document.querySelector(`a[href^="/event/${'${'}${'}'}${''}"]`); // placeholder to maintain tool format
              }, '');
            } catch (_) {}
            // Refaire proprement le recentrage (le format ci-dessus ne permet pas l'interpolation), on utilise une seconde évaluation dédiée
            try {
              const eid = lastSelectedEventId;
              await page.evaluate((id) => {
                const container = document.querySelector('.section-middle .scrollable-content') || document.documentElement || document.body;
                // cibler directement le conteneur d'évènement par data-event-id (plus robuste)
                const target = document.querySelector(`.game-events-container.prematch[data-event-id="${id}"]`) || document.querySelector(`a[href^="/event/${id}"]`);
                if (target && container && typeof container.scrollTo === 'function') {
                  const cRect = container.getBoundingClientRect();
                  const tRect = target.getBoundingClientRect();
                  const top = (tRect.top - cRect.top) + (container.scrollTop || 0) - 180; // offset pour avoir un peu de marge au-dessus
                  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                } else if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, eid);
              await delay(350);
            } catch (_) {}
          }
          const targetsPayload = await page.evaluate((processedList, startIdx, endIdx, maxOdd, mode, order, rrStart, rndOn, rndRate, market, ouLine, ouSidePriority) => {
            function norm(s) { return (s || '').trim().toLowerCase(); }
            const pickOrder = Array.isArray(order) && order.length ? order : ['1x','x2','12'];
            const newTargets = [];
            let rrIndexLocal = typeof rrStart === 'number' ? rrStart : 0;
            const events = Array.from(document.querySelectorAll('.game-events-container.prematch'));
            const slice = events.slice(Math.min(startIdx, events.length), Math.min(endIdx, events.length));
            for (const ev of slice) {
              // Skipper aléatoirement pour tous les marchés si activé
              if (rndOn) {
                if (Math.random() < (typeof rndRate === 'number' ? rndRate : 0.5)) {
                  continue;
                }
              }
              const link = ev.querySelector('a[href^="/event/"]');
              let eventId = null;
              if (link) {
                const m = (link.getAttribute('href') || '').match(/\/event\/(\d+)/);
                if (m) eventId = m[1];
              }
              if (!eventId || processedList.includes(eventId)) continue;

              const wraps = ev.querySelectorAll('.betline-list .event-bet-wrapper.bet-price .event-bet .anchor-wrap');
              if (!wraps || wraps.length === 0) continue;

              let chosenWrap = null;
              if (market === 'P/M') {
                // P/M: parser 'Plus de X.Y' / 'Moins de X.Y' et filtrer par ligne
                function parseOU(node) {
                  const raw = (node.querySelector('.event-selection')?.textContent || '').trim();
                  const low = raw.toLowerCase();
                  // Supporte variations (fr/en), on cherche nombre
                  const m = low.match(/([0-9]+(?:[\.,][0-9]+)?)/);
                  const line = m ? parseFloat(m[1].replace(',', '.')) : NaN;
                  const side = low.includes('moins') || low.includes('under') ? 'under' : (low.includes('plus') || low.includes('over') ? 'over' : null);
                  return { side, line, raw };
                }
                const eps = 1e-6;
                const candidates = Array.from(wraps).map(w => {
                  const meta = parseOU(w);
                  const isLocked = w.querySelector('.event-selection_locked, .event-odds_locked');
                  const oddTxt = (w.querySelector('.event-odds span')?.textContent || '').trim();
                  const oddNum = parseFloat(oddTxt.replace(',', '.'));
                  return { w, side: meta.side, line: meta.line, isLocked: !!isLocked, oddTxt, oddNum };
                }).filter(c => c.side && !isNaN(c.line) && Math.abs(c.line - (ouLine || 2.5)) < eps && !c.isLocked && !isNaN(c.oddNum) && (!isFinite(maxOdd) || c.oddNum <= maxOdd));
                if (candidates.length) {
                  // OU: ignorer selectionMode, utiliser uniquement la priorité over/under, fallback min
                  const first = ouSidePriority === 'under' ? 'under' : 'over';
                  const second = first === 'over' ? 'under' : 'over';
                  const cand1 = candidates.find(c => c.side === first);
                  const cand2 = candidates.find(c => c.side === second);
                  chosenWrap = (cand1 || cand2)?.w || null;
                  if (!chosenWrap) { candidates.sort((a,b) => a.oddNum - b.oddNum); chosenWrap = candidates[0]?.w || null; }
                }
              } else {
                // DC: logique existante (1X/X2/12)
                // Construire la liste des candidats admissibles (non lock et <= maxOdd)
                const candidates = Array.from(wraps).map(w => {
                  const label = norm(w.querySelector('.event-selection')?.textContent);
                  const isLocked = w.querySelector('.event-selection_locked, .event-odds_locked');
                  const oddTxt = (w.querySelector('.event-odds span')?.textContent || '').trim();
                  const oddNum = parseFloat(oddTxt.replace(',', '.'));
                  return { w, label, isLocked: !!isLocked, oddTxt, oddNum };
                }).filter(c => !c.isLocked && !isNaN(c.oddNum) && (!isFinite(maxOdd) || c.oddNum <= maxOdd));
                if (!candidates.length) continue;

                if (mode === 'min') {
                  // plus petite cote admissible, tie-break sur l'ordre pickOrder
                  candidates.sort((a,b) => {
                    if (a.oddNum !== b.oddNum) return a.oddNum - b.oddNum;
                    return pickOrder.indexOf(a.label) - pickOrder.indexOf(b.label);
                  });
                  chosenWrap = candidates[0]?.w || null;
                } else if (mode === 'round') {
                  // rotation: on essaie à partir de rrIndexLocal
                  for (let k = 0; k < pickOrder.length && !chosenWrap; k++) {
                    const lbl = pickOrder[(rrIndexLocal + k) % pickOrder.length];
                    const cand = candidates.find(c => c.label === lbl);
                    if (cand) { chosenWrap = cand.w; rrIndexLocal = (rrIndexLocal + 1) % pickOrder.length; }
                  }
                  if (!chosenWrap) {
                    // fallback: plus petite cote
                    candidates.sort((a,b) => a.oddNum - b.oddNum);
                    chosenWrap = candidates[0]?.w || null;
                  }
                } else {
                  // 'priority' par défaut: 1x > x2 > 12
                  for (const code of pickOrder) {
                    const cand = candidates.find(c => c.label === code);
                    if (cand) { chosenWrap = cand.w; break; }
                  }
                  if (!chosenWrap) {
                    // fallback: plus petite cote
                    candidates.sort((a,b) => a.oddNum - b.oddNum);
                    chosenWrap = candidates[0]?.w || null;
                  }
                }
              }

              if (!chosenWrap) continue;
              const priceId = chosenWrap.id || '';
              const label = (chosenWrap.querySelector('.event-selection')?.textContent || '').trim();
              const odd = (chosenWrap.querySelector('.event-odds span')?.textContent || '').trim();
              if (priceId) newTargets.push({ priceId, label, odd, eventId });

              if (newTargets.length >= 5) break; // batch limité par itération
            }
            return { newTargets, rrIndex: rrIndexLocal };
          }, Array.from(processedEventIds), startIndex, endIndex, maxOddPerSelection, selectionMode, pickOrder, rrIndex, randomMode, randomSkipRate, MARKET_ID, ouTargetLine, ouPriority);

          const targets = (targetsPayload && (targetsPayload.newTargets || targetsPayload.targets)) || [];
          if (typeof targetsPayload?.rrIndex === 'number') rrIndex = targetsPayload.rrIndex;

          if (targets && targets.length > 0) {
            console.log(`   🎯 Sélection en cours (batch ${targets.length})...`);
            for (const t of targets) {
              try {
                // scroll into view before click
                await page.evaluate((sid) => {
                  const el = document.querySelector(`#${sid}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, t.priceId);
                await delay(120);
                // Filtrer par limite de cote
                const oddNumPre = parseFloat(String(t.odd || '').replace(',', '.'));
                if (isFinite(maxOddPerSelection) && (!oddNumPre || isNaN(oddNumPre) || oddNumPre > maxOddPerSelection)) {
                  console.log(`   ⏭️ Ignoré (limite): ${t.label} @ ${t.odd} > ${maxOddPerSelection} (eventId=${t.eventId})`);
                  processedEventIds.add(t.eventId); // marquer comme traité pour avancer la fenêtre
                  continue;
                }
                // Revalider la présence de l'élément juste avant le clic
                const exists = await page.evaluate((sid) => !!document.querySelector(`#${sid}`), t.priceId);
                if (!exists) { continue; }
                await disableEventLinks();
                // Lire la cote totale actuelle avant clic (pour détecter un changement)
                const beforeUiTotal = (await readTotalOdds()) ?? currentTotal;

                // tentative de clic + léger retry
                let clicked = false;
                for (let r = 0; r < 2 && !clicked; r++) {
                  try {
                    await page.click(`#${t.priceId}`);
                    clicked = true;
                  } catch (_) {
                    await delay(120);
                    await page.evaluate((sid) => document.querySelector(`#${sid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), t.priceId);
                    await delay(120);
                  }
                }
                await delay(250);
                // verify selection state
                const selectedOk = await page.evaluate((sid) => {
                  const el = document.querySelector(`#${sid}`);
                  if (!el) return false;
                  const cont = el.closest('.event-bet-wrapper');
                  if (!cont) return false;
                  const cl = cont.classList;
                  return cl.contains('selected') || cl.contains('active') || cl.contains('event-bet--selected') || cont.getAttribute('aria-selected') === 'true';
                }, t.priceId);
                processedEventIds.add(t.eventId);
                totalSelected++;
                // Mémoriser le dernier évènement sélectionné pour recentrage ultérieur
                lastSelectedEventId = t.eventId;
                // Lire la cote totale affichée par le site (source de vérité) à CHAQUE tentative de sélection
                try {
                  await page.waitForFunction((prev) => {
                    const el = document.querySelector('.bet-details .bet-details-total-odds .current-value[data-test-id="totalOdds"]');
                    if (!el) return false;
                    const n = parseFloat((el.textContent || '').trim().replace(',', '.'));
                    if (isNaN(n)) return false;
                    // soit la cote est > 1.0 (au moins 1 pari), soit elle a changé par rapport à avant
                    return n > 1.0 && Math.abs(n - prev) > 1e-6;
                  }, { timeout: 1500 }, beforeUiTotal);
                } catch (_) { /* ignore timeout */ }
                const uiTotal = await readTotalOdds();
                if (uiTotal && !isNaN(uiTotal)) {
                  currentTotal = uiTotal;
                }
                console.log(selectedOk
                  ? `   ✅ Sélection confirmée: ${t.label} @ ${t.odd} (eventId=${t.eventId})`
                  : `   ⚠️ Sélection non confirmée (peut varier selon l'état du site): ${t.label} (eventId=${t.eventId})`);
                console.log(`   📈 Cote totale cumulée: ${currentTotal.toFixed(2)} / cible ${targetCote}`);
                if (currentTotal >= targetCote) {
                  console.log('   🛑 Cible atteinte, arrêt de la sélection.');
                  reachedTarget = true;
                  break;
                }
                if (totalSelected >= MAX_SELECT) break;
              } catch (e) {
                console.log(`   ⚠️ Échec clic (${t.eventId}): ${e.message}`);
              }
            }
            // Plus d'avancement de fenêtre: on s'appuie sur processedEventIds pour ne rien rater
          }
          else {
            // Rien de sélectionnable, on garde le balayage complet à l'itération suivante
          }
        }
      }
      return prevCount;
    }

    const totalChunks = await loadAllEvents();
    console.log(`📈 Total d'évènements chargés: ${totalChunks}`);
    if (reachedTarget) {
      console.log(`✅ Objectif atteint: cote cumulée ${currentTotal.toFixed(2)} ≥ ${targetCote}`);
      // Placement automatique éventuel
      if (placementAuto && stakeAmount > 0) {
        console.log('💰 Placement automatique activé.');
        const placed = await placeBet(page, stakeAmount);
        console.log(placed ? '🎉 Pari placé avec succès.' : '❌ Échec du placement du pari.');
        const newBalance = await getBalance(page);
        if (newBalance != null) console.log(`💰 Nouveau solde: ${newBalance}`);
      } else if (placementAuto) {
        console.log('ℹ️ Montant de mise invalide ou nul — placement annulé.');
      }
    } else {
      console.log(`ℹ️ Objectif non atteint: cote cumulée ${currentTotal.toFixed(2)} < ${targetCote}`);
    }
    // Affichage du totalOdds final
    try {
      const finalUiTotal = await readTotalOdds();
      if (finalUiTotal && !isNaN(finalUiTotal)) {
        console.log(`🏁 TotalOdds final (UI): ${finalUiTotal.toFixed(2)}`);
      } else {
        console.log(`🏁 TotalOdds final (calculé): ${currentTotal.toFixed(2)}`);
      }
    } catch (_) {
      console.log(`🏁 TotalOdds final (calculé): ${currentTotal.toFixed(2)}`);
    }

    // Extraction des sélections DC (1X, 12, X2)
    const results = await page.evaluate(() => {
      const LABELS = new Set(['1x', '12', 'x2']);

      function getEventRoot(node) {
        if (!node) return null;
        let el = node;
        for (let i = 0; i < 10 && el; i++) {
          // Chercher un ancêtre contenant un lien vers /event/<id> ou une carte match
          const link = el.querySelector ? el.querySelector('a[href^="/event/"]') : null;
          if (link) return el;
          el = el.parentElement;
        }
        return null;
      }

      function getEventIdFrom(root) {
        if (!root) return null;
        const a = root.querySelector('a[href^="/event/"]');
        if (a && a.getAttribute) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/\/event\/(\d+)/);
          return m ? m[1] : href;
        }
        return null;
      }

      function getTeamsFrom(root) {
        if (!root) return '';
        // Heuristique: prendre un header/titre proche
        const candidateSelectors = [
          '.game-event-header',
          '.game-event__header',
          '.event-header',
          '.event-title',
          'h3, h4, header',
        ];
        for (const sel of candidateSelectors) {
          const el = root.querySelector(sel);
          const text = el && el.textContent ? el.textContent.trim() : '';
          if (text && / vs | v | - /.test(text.toLowerCase())) return text;
          if (text && text.length > 0) return text;
        }
        // Fallback: texte global root
        return (root.textContent || '').trim().slice(0, 120);
      }

      // Collecter tous les éléments d'odd potentiels qui portent les labels DC
      const allClickable = Array.from(document.querySelectorAll('button, .event-bet, .event-odd, .odd, .bet, .event-odds span, .event-odds button'));

      const items = [];
      for (const el of allClickable) {
        const label = (el.textContent || '').trim().toLowerCase();
        if (!label) continue;

        // Essayer d'isoler un label court (1X, 12, X2) dans le texte
        const foundLabel = label.includes('1x') ? '1X' : label.includes('x2') ? 'X2' : label.includes('12') ? '12' : null;
        if (!foundLabel) continue;

        const root = getEventRoot(el);
        if (!root) continue;
        const eventId = getEventIdFrom(root) || 'unknown';

        // Tentative de récupérer la cote proche du label
        let odd = '';
        // Chercher un sibling numéraire
        const near = [el, el.parentElement, root];
        for (const scope of near) {
          if (!scope) continue;
          const oddsTextNodes = Array.from(scope.querySelectorAll('*'))
            .map((n) => (n.textContent || '').trim())
            .filter((t) => /\d+(?:[\.,]\d+)?/.test(t))
            .slice(0, 5);
          if (oddsTextNodes.length) {
            const cand = oddsTextNodes.find((t) => !t.toLowerCase().includes('1x') && !t.toLowerCase().includes('x2') && !t.toLowerCase().includes('12'));
            if (cand) { odd = cand; break; }
          }
        }

        items.push({ eventId, foundLabel, odd, teams: getTeamsFrom(root) });
      }

      // Regrouper par eventId et condenser
      const byEvent = new Map();
      for (const it of items) {
        if (!byEvent.has(it.eventId)) byEvent.set(it.eventId, { eventId: it.eventId, teams: it.teams, selections: {} });
        const rec = byEvent.get(it.eventId);
        if (!rec.selections[it.foundLabel]) rec.selections[it.foundLabel] = it.odd;
      }
      return Array.from(byEvent.values());
    });

    console.log('📊 Résultats DC (Football):');
    if (!results || results.length === 0) {
      console.log('Aucun évènement ou sélection DC détecté (les sélecteurs peuvent nécessiter un ajustement).');
    } else {
      // for (const ev of results) {
      //   console.log('—'.repeat(60));
      //   console.log('Match/Event ID:', ev.eventId);
      //   console.log('Teams/Titre   :', ev.teams);
      //   console.log('Sélections    :', ev.selections);
      // }
      // console.log('—'.repeat(60));
      // console.log(`✅ Total évènements détectés: ${results.length}`);
    }

    // Screenshot désactivé
    if (DO_SCREENSHOT) {
      try {
        await page.screenshot({ path: 'dc-test-screenshot.png', fullPage: true });
        console.log('📸 Screenshot enregistré: dc-test-screenshot.png');
      } catch (_) {}
    }

    // Désactivation de la sélection finale (on a déjà sélectionné pendant le scroll)

  } catch (err) {
    console.error('❌ Erreur pendant le test DC:', err.message);
  } finally {
    // Afficher une dernière fois le TotalOdds juste avant fermeture, pour qu'il soit en bas du log
    try {
      const finalUiTotal = await (typeof readTotalOdds === 'function' ? readTotalOdds() : null);
      if (finalUiTotal && !isNaN(finalUiTotal)) {
        console.log(`\n🏁 Récap final — TotalOdds: ${finalUiTotal.toFixed(2)} (UI)`);
      } else {
        console.log(`\n🏁 Récap final — TotalOdds: ${typeof currentTotal === 'number' ? currentTotal.toFixed(2) : 'N/A'} (calculé)`);
      }
    } catch (_) {
      console.log(`\n🏁 Récap final — TotalOdds: ${typeof currentTotal === 'number' ? currentTotal.toFixed(2) : 'N/A'} (calculé)`);
    }
    console.log('—'.repeat(80));

    // Laisser quelques secondes pour inspection avant fermeture
    await delay(3000);
    await browser.close();
  }
}

if (require.main === module) {
  run();
}
