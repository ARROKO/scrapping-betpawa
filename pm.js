require("dotenv").config();
const puppeteer = require("puppeteer");
const readline = require("readline");
// Modification de la fonction demanderOption()
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
    console.log("4. Plus/Moins de buts (Stratégie sûre)");
    console.log("5. Plus/Moins de buts (Privilégier les buts)");
    console.log("6. Plus/Moins de buts (Privilégier la sécurité)");
    console.log("7. Plus/Moins de buts (Rapport qualité/prix)");
    rl.question("Votre choix (1-7) : ", (reponse) => {
      rl.close();
      resolve(reponse.trim());
    });
  });
}

// Modification de la fonction processMatch pour supporter les différentes stratégies
async function processMatch(page, matchElement, strategy = 'double_chance') {
  try {
    const initialUrl = page.url();
    console.log(`🌐 URL initiale: ${initialUrl}`);
    
    console.log("👆 Clic sur le match...");
    await matchElement.click();
    await delay(3000);

    const currentUrl = page.url();
    console.log(`🌐 URL actuelle: ${currentUrl}`);
    
    if (!currentUrl.includes('/event/')) {
      throw new Error("Pas arrivé sur la page du match");
    }

    console.log("✅ Page du match chargée");

    let result;
    
    // Sélectionner la bonne stratégie
    switch(strategy) {
      case 'double_chance':
        result = await selectDoubleChance(page);
        break;
      case 'over_under_safe':
        result = await selectOverUnderWithStrategy(page, 'safe');
        break;
      case 'over_under_goals':
        result = await selectOverUnderWithStrategy(page, 'over_goals');
        break;
      case 'over_under_defensive':
        result = await selectOverUnderWithStrategy(page, 'under_goals');
        break;
      case 'over_under_value':
        result = await selectOverUnderWithStrategy(page, 'value');
        break;
      default:
        result = await selectDoubleChance(page);
    }
    
    // Revenir à la liste des matchs
    if (currentUrl !== initialUrl) {
      console.log("🔙 Retour à la liste des matchs...");
      await page.goBack();
      await delay(3000);
      
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

// Modification de la fonction safeClickAndPlaceBet pour supporter les stratégies
async function safeClickAndPlaceBetWithStrategy(page, targetOdds = 10, strategy = 'double_chance') {
  let currentTotal = 1;
  let selectedMatches = 0;
  let consecutiveNoMatches = 0;
  const MAX_CONSECUTIVE_NO_MATCHES = 5;
  const usedMatches = new Set();

  console.log(`🎯 Stratégie sélectionnée: ${strategy}`);

  while (currentTotal < targetOdds && consecutiveNoMatches < MAX_CONSECUTIVE_NO_MATCHES) {
    console.log(`\n🔢 Total actuel: ${currentTotal.toFixed(2)} (Objectif: ${targetOdds})`);
    console.log(`📊 Matchs sélectionnés: ${selectedMatches}`);

    try {
      await page.waitForSelector('.game-event-wrapper', { timeout: 10000 });
      const matches = await page.$$('.game-event-wrapper');
      console.log(`📋 ${matches.length} matchs disponibles`);

      let foundValidMatch = false;

      for (let i = 0; i < matches.length; i++) {
        try {
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

          const result = await processMatch(page, matches[i], strategy);

          if (result.success) {
            currentTotal *= result.odds;
            selectedMatches++;
            foundValidMatch = true;
            usedMatches.add(matchKey);
            
            console.log(`✅ Match sélectionné! ${result.selection} @${result.odds}`);
            console.log(`🎯 Nouveau total: ${currentTotal.toFixed(2)}`);
            
            if (currentTotal >= targetOdds) {
              console.log(`🎉 Objectif atteint ! Total: ${currentTotal.toFixed(2)}`);
              break;
            }
            
            break;
          } else {
            usedMatches.add(matchKey);
            console.log(`❌ Échec sur: ${matchInfo.teams[0]} vs ${matchInfo.teams[1]}`);
          }
        } catch (error) {
          console.error(`❌ Erreur lors de l'analyse du match ${i + 1}:`, error.message);
        }
      }

      if (!foundValidMatch) {
        consecutiveNoMatches++;
        console.log(`🔄 Aucun match valide trouvé (${consecutiveNoMatches}/${MAX_CONSECUTIVE_NO_MATCHES})`);
        
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
    efficiency: ((currentTotal / targetOdds) * 100).toFixed(1),
    strategy: strategy
  };
}

// Modification de la logique principale
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

  let strategy, description;

  switch (choix) {
    case "1":
      strategy = 'double_chance';
      description = 'Double chance';
      break;
    case "2":
      console.log("⚠️ Option 2 (Juste victoire) non encore implémentée");
      await browser.close();
      return;
    case "3":
      console.log("⚠️ Option 3 (Plus de 0.5 but spécifique) non encore implémentée");
      await browser.close();
      return;
    case "4":
      strategy = 'over_under_safe';
      description = 'Plus/Moins de buts (Sûr)';
      break;
    case "5":
      strategy = 'over_under_goals';
      description = 'Plus/Moins de buts (Pro-buts)';
      break;
    case "6":
      strategy = 'over_under_defensive';
      description = 'Plus/Moins de buts (Défensif)';
      break;
    case "7":
      strategy = 'over_under_value';
      description = 'Plus/Moins de buts (Valeur)';
      break;
    default:
      console.log("⚠️ Option non reconnue");
      await browser.close();
      return;
  }

  console.log(`🎯 Stratégie: ${description}`);
  console.log("📋 Recherche des meilleurs paris...\n");
  
  const result = await safeClickAndPlaceBetWithStrategy(page, 10, strategy);
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 RÉSULTATS FINAUX");
  console.log("=".repeat(50));
  console.log(`🎯 Stratégie: ${description}`);
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

  console.log("\n💡 Navigateur ouvert pour inspection - Appuyez sur Ctrl+C pour fermer");
})();