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

  let targetCote = 0;
  while (!targetCote || isNaN(targetCote) || targetCote < 2) {
    const input = await ask('🎯 Cote totale à atteindre (ex: 10) : ');
    targetCote = parseFloat((input || '').replace(',', '.'));
    if (!targetCote || isNaN(targetCote) || targetCote < 2) {
      console.log("❌ Entrez un nombre valide ≥ 2");
    }
  }

  let maxOddPerSelection = Infinity;
  const maxInput = await ask('⚖️ Limite de cote par sélection (ex: 2.0) ou ENTER pour aucune limite : ');
  if (maxInput) {
    const parsed = parseFloat(maxInput.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 1.01) maxOddPerSelection = parsed;
  }

  let currentTotal = 1.0;
  let reachedTarget = false;

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1366, height: 820 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    slowMo: 50,
  });

  const page = await browser.newPage();

  try {
    console.log('➡️  Navigation vers:', TEST_URL);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

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
        await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
      let lastProcessedCount = 0; // nombre d'évènements déjà considérés dans les boucles précédentes
      const processedEventIds = new Set();
      const MAX_SELECT = MAX_INTERLEAVED_SELECT; // sélection maximum pendant le scroll
      let totalSelected = 0;

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
          // Faire défiler vers le bas uniquement (éviter de remonter)
          const events = Array.from(document.querySelectorAll('.game-events-container.prematch'));
          const lastEvent = events[events.length - 1];
          if (lastEvent) lastEvent.scrollIntoView({ behavior: 'smooth', block: 'end' });
          if (container && typeof container.scrollTo === 'function') {
            container.scrollTo({ top: container.scrollTop + 1000, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }
          const count = events.length;
          return { hasContainer: !!container, count };
        });

        // Scroll avec rebond
        await page.evaluate(() => {
          const container = document.querySelector('.section-middle .scrollable-content') || document.body;
          const to = container.scrollHeight || document.body.scrollHeight;
          if (typeof container.scrollTo === 'function') {
            container.scrollTo({ top: to, behavior: 'smooth' });
          } else {
            window.scrollTo({ top: to, behavior: 'smooth' });
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
          // Déterminer la fenêtre de nouveaux évènements à traiter (entre lastProcessedCount et count)
          let startIndex = lastProcessedCount;
          if (startIndex < 0) startIndex = 0;
          if (startIndex > count) startIndex = Math.max(0, count - 1);
          const endIndex = count;
          const targets = await page.evaluate((processedList, startIdx, endIdx) => {
            function norm(s) { return (s || '').trim().toLowerCase(); }
            const pickOrder = ['1x', 'x2', '12'];
            const newTargets = [];
            const events = Array.from(document.querySelectorAll('.game-events-container.prematch'));
            const slice = events.slice(Math.min(startIdx, events.length), Math.min(endIdx, events.length));
            for (const ev of slice) {
              const link = ev.querySelector('a[href^="/event/"]');
              let eventId = null;
              if (link) {
                const m = (link.getAttribute('href') || '').match(/\/event\/(\d+)/);
                if (m) eventId = m[1];
              }
              if (!eventId || processedList.includes(eventId)) continue;

              const wraps = ev.querySelectorAll('.betline-list .event-bet-wrapper.bet-price .event-bet .anchor-wrap');
              if (!wraps || wraps.length === 0) continue;

              let chosen = null;
              for (const code of pickOrder) {
                chosen = Array.from(wraps).find(w => {
                  const label = norm(w.querySelector('.event-selection')?.textContent);
                  const isLocked = w.querySelector('.event-selection_locked, .event-odds_locked');
                  return label === code && !isLocked;
                });
                if (chosen) break;
              }
              if (!chosen) continue;

              const priceId = chosen.id || '';
              const label = (chosen.querySelector('.event-selection')?.textContent || '').trim();
              const odd = (chosen.querySelector('.event-odds span')?.textContent || '').trim();
              if (priceId) newTargets.push({ priceId, label, odd, eventId });

              if (newTargets.length >= 5) break; // batch limité par itération
            }
            return newTargets;
          }, Array.from(processedEventIds), startIndex, endIndex);

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
            // Après traitement, avancer la fenêtre
            lastProcessedCount = Math.max(lastProcessedCount, count);
          }
          else {
            // Rien de sélectionnable dans cette fenêtre, avancer tout de même la fenêtre pour éviter de rebalayer
            lastProcessedCount = Math.max(lastProcessedCount, count);
          }
        }
      }
      return prevCount;
    }

    const totalChunks = await loadAllEvents();
    console.log(`📈 Total d'évènements chargés: ${totalChunks}`);
    if (reachedTarget) {
      console.log(`✅ Objectif atteint: cote cumulée ${currentTotal.toFixed(2)} ≥ ${targetCote}`);
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
