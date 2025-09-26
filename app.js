const puppeteer = require('puppeteer');

// Config test
const DO_SCREENSHOT = false; // stop screenshots per user request
const MAX_INTERLEAVED_SELECT = 200; // allow selecting throughout scroll

// Test URL for Football Double Chance (DC)
const TEST_URL = 'https://www.betpawa.cm/events?marketId=DC&categoryId=2';

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function run() {
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
      const processedEventIds = new Set();
      const MAX_SELECT = MAX_INTERLEAVED_SELECT; // sélection maximum pendant le scroll
      let totalSelected = 0;

      for (let i = 0; i < MAX_LOOPS && idle < IDLE_THRESHOLD; i++) {
        // Détection du bon conteneur scrollable (réel): .section-middle .scrollable-content
        const stats = await page.evaluate(() => {
          function isScrollable(el) {
            if (!el || !(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            const canScroll = ['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflow);
            return canScroll && el.scrollHeight > el.clientHeight;
          }
          const container = document.querySelector('.section-middle .scrollable-content');
          // Faire défiler le dernier évènement dans le viewport
          const events = Array.from(document.querySelectorAll('.game-events-container.prematch'));
          const lastEvent = events[events.length - 1];
          if (lastEvent) lastEvent.scrollIntoView({ behavior: 'smooth', block: 'end' });

          // Petit scroll du conteneur principal
          if (container && typeof container.scrollTo === 'function') {
            container.scrollTo({ top: container.scrollTop + 800, behavior: 'smooth' });
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
            setTimeout(() => container.scrollTo({ top: to * 0.9, behavior: 'smooth' }), 150);
            setTimeout(() => container.scrollTo({ top: to, behavior: 'smooth' }), 300);
          } else {
            window.scrollTo({ top: to, behavior: 'smooth' });
            setTimeout(() => window.scrollTo({ top: to * 0.9, behavior: 'smooth' }), 150);
            setTimeout(() => window.scrollTo({ top: to, behavior: 'smooth' }), 300);
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
        const count = await page.evaluate(() => document.querySelectorAll('.game-events-container.prematch').length);
        console.log(`   ➕ Chunks: ${count} (loop ${i + 1})`);
        if (count <= prevCount) idle++; else idle = 0;
        prevCount = count;

        // Intercaler la sélection pendant le scroll pour les nouveaux évènements
        if (totalSelected < MAX_SELECT) {
          const targets = await page.evaluate((processedList) => {
            function norm(s) { return (s || '').trim().toLowerCase(); }
            const pickOrder = ['1x', 'x2', '12'];
            const newTargets = [];
            const events = Array.from(document.querySelectorAll('.game-events-container.prematch'));
            for (const ev of events) {
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
          }, Array.from(processedEventIds));

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
                await page.click(`#${t.priceId}`);
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
                console.log(selectedOk
                  ? `   ✅ Sélection confirmée: ${t.label} @ ${t.odd} (eventId=${t.eventId})`
                  : `   ⚠️ Sélection non confirmée (peut varier selon l'état du site): ${t.label} (eventId=${t.eventId})`);
                if (totalSelected >= MAX_SELECT) break;
              } catch (e) {
                console.log(`   ⚠️ Échec clic (${t.eventId}): ${e.message}`);
              }
            }
          }
        }
      }
      return prevCount;
    }

    const totalChunks = await loadAllEvents();
    console.log(`📈 Total d'évènements chargés: ${totalChunks}`);

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
      for (const ev of results) {
        console.log('—'.repeat(60));
        console.log('Match/Event ID:', ev.eventId);
        console.log('Teams/Titre   :', ev.teams);
        console.log('Sélections    :', ev.selections);
      }
      console.log('—'.repeat(60));
      console.log(`✅ Total évènements détectés: ${results.length}`);
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
    // Laisser quelques secondes pour inspection avant fermeture
    await delay(5000);
    await browser.close();
  }
}

if (require.main === module) {
  run();
}
