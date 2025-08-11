require("dotenv").config();
const puppeteer = require("puppeteer");
const readline = require("readline");

function demanderOption() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("Choisissez une option :");
    console.log("1. Double chance");
    console.log("2. Juste victoire");
    console.log("3. Plus de 0.5 but");
    rl.question("Votre choix (1-3) : ", (reponse) => {
      rl.close();
      resolve(reponse.trim());
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function selectDoubleChance(page) {
  try {
    console.log("🔍 Recherche des options Double Chance...");
    
    // Attendre que la section Double Chance soit visible
    await page.waitForSelector('[data-test-id="market-4693"]', { timeout: 10000 });
    console.log("✅ Section Double Chance trouvée");
    
    // Récupérer les options double chance avec une approche plus robuste
    const doubleChanceOptions = await page.evaluate(() => {
      const options = [];
      
      // 1X (Domicile ou Match Nul)
      const bet1X = document.querySelector('[data-test-id="Odd-4693-4694"]');
      if (bet1X) {
        const selection = bet1X.querySelector('.event-selection');
        const oddsSpan = bet1X.querySelector('.event-odds span:not(.svg-icon)');
        if (selection && oddsSpan) {
          options.push({
            selector: '[data-test-id="Odd-4693-4694"] .event-bet',
            selection: selection.textContent.trim(),
            odds: parseFloat(oddsSpan.textContent.replace(',', '.'))
          });
        }
      }
      
      // X2 (Match Nul ou Extérieur)
      const betX2 = document.querySelector('[data-test-id="Odd-4693-4695"]');
      if (betX2) {
        const selection = betX2.querySelector('.event-selection');
        const oddsSpan = betX2.querySelector('.event-odds span:not(.svg-icon)');
        if (selection && oddsSpan) {
          options.push({
            selector: '[data-test-id="Odd-4693-4695"] .event-bet',
            selection: selection.textContent.trim(),
            odds: parseFloat(oddsSpan.textContent.replace(',', '.'))
          });
        }
      }
      
      // 12 (Domicile ou Extérieur)
      const bet12 = document.querySelector('[data-test-id="Odd-4693-4696"]');
      if (bet12) {
        const selection = bet12.querySelector('.event-selection');
        const oddsSpan = bet12.querySelector('.event-odds span:not(.svg-icon)');
        if (selection && oddsSpan) {
          options.push({
            selector: '[data-test-id="Odd-4693-4696"] .event-bet',
            selection: selection.textContent.trim(),
            odds: parseFloat(oddsSpan.textContent.replace(',', '.'))
          });
        }
      }
      
      return options;
    });

    if (doubleChanceOptions.length === 0) {
      throw new Error("Aucune option Double Chance trouvée");
    }

    console.log(`📊 Options trouvées: ${doubleChanceOptions.map(o => `${o.selection} @${o.odds}`).join(', ')}`);

    // Choisir la meilleure option (cote la plus basse = plus sûre)
    const bestOption = doubleChanceOptions.reduce((best, current) => 
      current.odds < best.odds ? current : best
    );

    console.log(`🎯 Sélection: ${bestOption.selection} @${bestOption.odds}`);

    // Cliquer sur la meilleure option
    await page.click(bestOption.selector);
    await delay(2000);

    // Vérifier que l'option est sélectionnée
    const isSelected = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return element && element.classList.contains('selected');
    }, bestOption.selector);

    if (isSelected) {
      console.log("✅ Option sélectionnée avec succès !");
      return {
        success: true,
        selection: bestOption.selection,
        odds: bestOption.odds
      };
    } else {
      throw new Error("La sélection n'a pas été prise en compte");
    }

  } catch (error) {
    console.error("❌ Erreur lors de la sélection:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function processMatch(page, matchElement) {
  try {
    // Récupérer l'URL actuelle avant de cliquer
    const initialUrl = page.url();
    console.log(`🌐 URL initiale: ${initialUrl}`);
    
    // Ouvrir la page du match
    console.log("👆 Clic sur le match...");
    await matchElement.click();
    await delay(3000);

    // Vérifier qu'on est bien sur une page de match
    const currentUrl = page.url();
    console.log(`🌐 URL actuelle: ${currentUrl}`);
    
    if (!currentUrl.includes('/event/')) {
      throw new Error("Pas arrivé sur la page du match");
    }

    console.log("✅ Page du match chargée");

    // Sélectionner l'option double chance
    const result = await selectDoubleChance(page);
    
    // Revenir à la liste des matchs - UNE SEULE FOIS
    if (currentUrl !== initialUrl) {
      console.log("🔙 Retour à la liste des matchs...");
      await page.goBack();
      await delay(3000);
      
      // Vérifier qu'on est bien revenu
      const backUrl = page.url();
      console.log(`🌐 URL de retour: ${backUrl}`);
      
      if (backUrl.includes('/event/')) {
        console.log("⚠️ Pas encore revenu, second retour...");
        await page.goBack();
        await delay(2000);
      }
    }

    return result;

  } catch (error) {
    console.error("❌ Erreur lors du traitement du match:", error.message);
    
    // En cas d'erreur, vérifier si on doit revenir en arrière
    const errorUrl = page.url();
    if (errorUrl.includes('/event/')) {
      console.log("🔄 Tentative de retour après erreur...");
      try {
        await page.goBack();
        await delay(2000);
      } catch (e) {
        console.error("❌ Impossible de revenir:", e.message);
      }
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function safeClickAndPlaceBet(page, targetOdds = 10) {
  let currentTotal = 1;
  let selectedMatches = 0;
  let consecutiveNoMatches = 0;
  const MAX_CONSECUTIVE_NO_MATCHES = 5;
  const usedMatches = new Set(); // Pour éviter les doublons

  while (currentTotal < targetOdds && consecutiveNoMatches < MAX_CONSECUTIVE_NO_MATCHES) {
    console.log(`\n🔢 Total actuel: ${currentTotal.toFixed(2)} (Objectif: ${targetOdds})`);
    console.log(`📊 Matchs sélectionnés: ${selectedMatches}`);

    try {
      // Attendre les matchs visibles
      await page.waitForSelector('.game-event-wrapper', { timeout: 10000 });
      const matches = await page.$$('.game-event-wrapper');
      console.log(`📋 ${matches.length} matchs disponibles`);

      let foundValidMatch = false;

      for (let i = 0; i < matches.length; i++) {
        try {
          // Récupérer les informations du match
          const matchInfo = await matches[i].evaluate(el => {
            const teams = Array.from(el.querySelectorAll('.scoreboard-participant-name'))
              .map(team => team.textContent.trim());
            const href = el.getAttribute('href');
            return { teams, href };
          });

          const matchKey = `${matchInfo.teams[0]}_vs_${matchInfo.teams[1]}`;
          
          if (usedMatches.has(matchKey)) {
            console.log(`⏭️ Match déjà traité: ${matchInfo.teams[0]} vs ${matchInfo.teams[1]}`);
            continue;
          }

          console.log(`\n🔍 Analyse: ${matchInfo.teams[0]} vs ${matchInfo.teams[1]}`);

          const result = await processMatch(page, matches[i]);

          if (result.success) {
            currentTotal *= result.odds;
            selectedMatches++;
            foundValidMatch = true;
            usedMatches.add(matchKey);
            
            console.log(`✅ Match sélectionné! ${result.selection} @${result.odds}`);
            console.log(`🎯 Nouveau total: ${currentTotal.toFixed(2)}`);
            
            // Vérifier si l'objectif est atteint
            if (currentTotal >= targetOdds) {
              console.log(`🎉 Objectif atteint ! Total: ${currentTotal.toFixed(2)}`);
              break;
            }
            
            break; // Sortir de la boucle des matchs pour recommencer la recherche
          } else {
            usedMatches.add(matchKey); // Marquer comme traité même si échec
            console.log(`❌ Échec sur: ${matchInfo.teams[0]} vs ${matchInfo.teams[1]}`);
          }
        } catch (error) {
          console.error(`❌ Erreur lors de l'analyse du match ${i + 1}:`, error.message);
        }
      }

      if (!foundValidMatch) {
        consecutiveNoMatches++;
        console.log(`🔄 Aucun match valide trouvé (${consecutiveNoMatches}/${MAX_CONSECUTIVE_NO_MATCHES})`);
        
        // Si on a épuisé les matchs, on peut scroller ou arrêter
        if (consecutiveNoMatches >= MAX_CONSECUTIVE_NO_MATCHES) {
          console.log("🛑 Arrêt après trop d'échecs consécutifs");
          break;
        }
      } else {
        consecutiveNoMatches = 0;
      }

    } catch (error) {
      console.error("🚨 Erreur générale:", error.message);
      consecutiveNoMatches++;
    }
  }

  return {
    success: currentTotal >= targetOdds,
    totalOdds: currentTotal,
    selectedMatches,
    efficiency: ((currentTotal / targetOdds) * 100).toFixed(1)
  };
}

(async () => {
  const choix = await demanderOption();

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 100,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  console.log("🚀 Connexion à BetPawa...");
  await page.goto("https://www.betpawa.cm/", {
    waitUntil: "networkidle2",
    timeout: 30000
  });

  // Cliquer sur "Tout voir Football" si disponible
  try {
    await page.waitForSelector('div.event-counter span.pointer', { timeout: 5000 });
    await page.click('div.event-counter span.pointer');
    console.log('✅ Clic sur "Tout voir Football"');
    await delay(3000);
  } catch {
    console.log('ℹ️ "Tout voir Football" non trouvé ou déjà sur la page');
  }

  if (choix === "1") {
    console.log("🎯 Stratégie: Double chance");
    console.log("📋 Recherche des meilleurs paris Double Chance...\n");
    
    const result = await safeClickAndPlaceBet(page, 10);
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 RÉSULTATS FINAUX");
    console.log("=".repeat(50));
    console.log(`🎯 Objectif: 10x`);
    console.log(`📈 Total atteint: ${result.totalOdds.toFixed(2)}x`);
    console.log(`⚽ Matchs sélectionnés: ${result.selectedMatches}`);
    console.log(`✅ Succès: ${result.success ? 'OUI 🎉' : 'NON ⚠️'}`);
    console.log(`📊 Efficacité: ${result.efficiency}%`);
    console.log("=".repeat(50));
    
    if (result.success) {
      console.log("🎉 Félicitations ! Objectif atteint !");
    } else {
      console.log("⚠️ Objectif non atteint, mais des paris ont été sélectionnés.");
    }
  } else {
    console.log("⚠️ Seule l'option 1 (Double chance) est implémentée");
  }

  console.log("\n💡 Navigateur ouvert pour inspection - Appuyez sur Ctrl+C pour fermer");
  // await browser.close();
})();