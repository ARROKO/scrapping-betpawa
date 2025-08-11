require("dotenv").config();
const puppeteer = require("puppeteer");
const readline = require("readline");

// ===== FONCTION DE DÉLAI =====
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Interface pour poser les questions
function poserQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (reponse) => {
      rl.close();
      resolve(reponse.trim());
    });
  });
}

async function demanderParametres() {
  console.log("=".repeat(60));
  console.log("🎮 CONFIGURATION DU BOT BETPAWA");
  console.log("=".repeat(60));
  
  // 1. Connexion automatique
  console.log("\n🔐 Connexion automatique :");
  console.log("OUI : Connexion automatique avec .env");
  console.log("NON : Connexion manuelle");
  
  let connexionAuto;
  do {
    const input = await poserQuestion("Utiliser la connexion automatique ? (oui/non) : ");
    if (['oui', 'o', 'yes', 'y', '1'].includes(input.toLowerCase())) {
      connexionAuto = true;
    } else if (['non', 'n', 'no', '0'].includes(input.toLowerCase())) {
      connexionAuto = false;
    } else {
      console.log("❌ Veuillez répondre par 'oui' ou 'non'");
      connexionAuto = null;
    }
  } while (connexionAuto === null);

  // 2. Choix de la stratégie
  console.log("\n📋 Choisissez une stratégie de paris :");
  console.log("1. Double chance (Conservateur) ⭐ RECOMMANDÉ");
  console.log("2. Juste victoire (Équilibré)");
  console.log("3. Plus de 0.5 but (Spécialisé)");
  console.log("4. Double chance + victoire (Agressif)");
  console.log("5. Double chance + Plus de 0.5 but (Mixte)");
  console.log("6. Juste victoire + Plus de 0.5 but (Ultra)");
  
  let choixStrategie;
  do {
    choixStrategie = await poserQuestion("Votre choix (1-6) : ");
  } while (!['1', '2', '3', '4', '5', '6'].includes(choixStrategie));

  // 3. Cote totale cible
  console.log("\n🎯 Objectif de cote totale :");
  console.log("Exemples : 10 (facile), 50 (moyen), 100 (difficile), 500 (expert)");
  
  let coteTarget;
  do {
    const input = await poserQuestion("Cote totale à atteindre (minimum 5) : ");
    coteTarget = parseFloat(input);
    if (isNaN(coteTarget) || coteTarget < 5) {
      console.log("❌ Veuillez entrer un nombre valide ≥ 5");
      coteTarget = null;
    }
  } while (!coteTarget);

  // 4. Cote maximale par pari
  console.log("\n⚖️ Limite de cote par pari :");
  console.log("Exemples : 1.5 (très sûr), 2.0 (sûr), 2.5 (équilibré), 3.0 (risqué)");
  
  let coteMaxPari;
  do {
    const input = await poserQuestion("Cote maximale par pari (1.1 - 5.0) : ");
    coteMaxPari = parseFloat(input);
    if (isNaN(coteMaxPari) || coteMaxPari < 1.1 || coteMaxPari > 5.0) {
      console.log("❌ Veuillez entrer un nombre entre 1.1 et 5.0");
      coteMaxPari = null;
    }
  } while (!coteMaxPari);

  // 5. Mode aléatoire
  console.log("\n🎲 Mode de sélection :");
  console.log("OUI : Sélection intelligente et aléatoire (recommandé)");
  console.log("NON : Sélection séquentielle classique");
  
  let modeAleatoire;
  do {
    const input = await poserQuestion("Utiliser le mode aléatoire ? (oui/non) : ");
    if (['oui', 'o', 'yes', 'y', '1'].includes(input.toLowerCase())) {
      modeAleatoire = true;
    } else if (['non', 'n', 'no', '0'].includes(input.toLowerCase())) {
      modeAleatoire = false;
    } else {
      console.log("❌ Veuillez répondre par 'oui' ou 'non'");
      modeAleatoire = null;
    }
  } while (modeAleatoire === null);

  // 6. Montant de mise
  let montantMise;
  do {
    const input = await poserQuestion("\n💰 Montant de la mise (minimum 1) : ");
    montantMise = parseFloat(input);
    if (isNaN(montantMise) || montantMise < 1) {
      console.log("❌ Veuillez entrer un montant valide ≥ 1");
      montantMise = null;
    }
  } while (!montantMise);

  // 7. Placement automatique
  console.log("\n🎰 Placement de mise :");
  console.log("OUI : Placement automatique dès que l'objectif est atteint");
  console.log("NON : Arrêt pour placement manuel");
  
  let placementAuto;
  do {
    const input = await poserQuestion("Placement automatique ? (oui/non) : ");
    if (['oui', 'o', 'yes', 'y', '1'].includes(input.toLowerCase())) {
      placementAuto = true;
    } else if (['non', 'n', 'no', '0'].includes(input.toLowerCase())) {
      placementAuto = false;
    } else {
      console.log("❌ Veuillez répondre par 'oui' ou 'non'");
      placementAuto = null;
    }
  } while (placementAuto === null);

  // 8. Confirmation
  console.log("\n" + "=".repeat(50));
  console.log("📋 RÉCAPITULATIF DE LA CONFIGURATION");
  console.log("=".repeat(50));
  console.log(`🔐 Connexion auto: ${connexionAuto ? 'OUI' : 'NON'}`);
  console.log(`🎮 Stratégie: Option ${choixStrategie}`);
  console.log(`🎯 Cote cible: ${coteTarget}x`);
  console.log(`⚖️ Cote max/pari: ${coteMaxPari}x`);
  console.log(`🎲 Mode aléatoire: ${modeAleatoire ? 'OUI' : 'NON'}`);
  console.log(`💰 Mise: ${montantMise}`);
  console.log(`🎰 Placement auto: ${placementAuto ? 'OUI' : 'NON'}`);
  console.log("=".repeat(50));
  
  const confirmation = await poserQuestion("\n✅ Confirmer ces paramètres ? (oui/non) : ");
  
  if (!['oui', 'o', 'yes', 'y', '1'].includes(confirmation.toLowerCase())) {
    console.log("❌ Configuration annulée.");
    process.exit(0);
  }

  return {
    connexionAuto,
    strategie: choixStrategie,
    coteTarget: coteTarget,
    coteMaxPari: coteMaxPari,
    modeAleatoire: modeAleatoire,
    montantMise: montantMise,
    placementAuto: placementAuto
  };
}

// ===== FONCTION DE CONNEXION =====
async function connexionAutomatique(page) {
  try {
    console.log("🔐 Début de la connexion automatique...");

    // Vérifier les variables d'environnement
    if (!process.env.COUNTRY_CODE || !process.env.PHONE_NUMBER || !process.env.PASSWORD) {
      console.log("❌ Variables d'environnement manquantes");
      console.log("Ajoutez dans votre .env :");
      console.log("COUNTRY_CODE=+237");
      console.log("PHONE_NUMBER=votre_numero");
      console.log("PASSWORD=votre_mot_de_passe");
      return false;
    }

    // Cliquer sur le bouton Connexion
    await page.waitForSelector('a.button.button-accent[href="/login"]', { timeout: 10000 });
    await page.click('a.button.button-accent[href="/login"]');
    console.log("✅ Clic sur le bouton connexion");

    // Remplir le code pays
    await page.waitForSelector(".country-code", { timeout: 5000 });
    await page.type(".country-code", process.env.COUNTRY_CODE);
    console.log("✅ Code pays saisi");

    // Remplir le numéro de téléphone
    await page.waitForSelector("#login-form-phoneNumber", { timeout: 5000 });
    await page.type("#login-form-phoneNumber", process.env.PHONE_NUMBER);
    console.log("✅ Numéro de téléphone saisi");

    // Remplir le mot de passe
    await page.waitForSelector("#login-form-password-input", { timeout: 5000 });
    await page.type("#login-form-password-input", process.env.PASSWORD);
    console.log("✅ Mot de passe saisi");

    // Cliquer sur le bouton de connexion
    await page.click('input[data-test-id="logInButton"]');
    console.log("✅ Clic sur le bouton de connexion");

    // Attendre la connexion
    await page.waitForSelector(".balance", { timeout: 10000 });
    console.log("✅ Connexion réussie!");

    // Récupérer et afficher le solde
    const soldeNum = await recupererSolde(page);
    console.log("💰 Solde actuel:", soldeNum);

    if (soldeNum <= 0) {
      console.log("❌ Solde insuffisant:", soldeNum);
      return false;
    }

    console.log("✅ Solde suffisant pour continuer");
    return true;

  } catch (error) {
    console.error("❌ Erreur de connexion:", error.message);
    return false;
  }
}

// ===== FONCTION DE RÉCUPÉRATION DU SOLDE =====
async function recupererSolde(page) {
  try {
    const soldeText = await page.$eval("span.button.balance", (span) => span.textContent.trim());
    const match = soldeText.match(/[\d,.]+/);
    return match ? parseFloat(match[0].replace(",", ".")) : 0;
  } catch (error) {
    console.log("⚠️ Impossible de récupérer le solde");
    return 0;
  }
}

// ===== FONCTION DE SÉLECTION DOUBLE CHANCE AMÉLIORÉE =====
async function selectDoubleChance(page) {
  try {
    console.log("🔍 Recherche des options Double Chance...");
    
    // Attendre que la section Double Chance soit visible
    await page.waitForSelector('[data-test-id="market-4693"]', { timeout: 15000 });
    console.log("✅ Section Double Chance trouvée");
    
    // Attendre un peu plus pour s'assurer que tout est chargé
    await delay(2000);
    
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

    // Cliquer sur la meilleure option avec retry
    let clickSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.click(bestOption.selector);
        await delay(3000); // Attendre plus longtemps
        
        // Vérifier que l'option est sélectionnée
        const isSelected = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          return element && element.classList.contains('selected');
        }, bestOption.selector);

        if (isSelected) {
          clickSuccess = true;
          console.log("✅ Option Double Chance sélectionnée avec succès !");
          break;
        } else {
          console.log(`⚠️ Tentative ${attempt}/3 - Pas encore sélectionné`);
          if (attempt < 3) await delay(2000);
        }
      } catch (error) {
        console.log(`⚠️ Tentative ${attempt}/3 échouée:`, error.message);
        if (attempt < 3) await delay(2000);
      }
    }

    if (clickSuccess) {
      return {
        success: true,
        selection: bestOption.selection,
        odds: bestOption.odds,
        type: 'double_chance'
      };
    } else {
      throw new Error("Impossible de sélectionner l'option après 3 tentatives");
    }

  } catch (error) {
    console.error("❌ Erreur lors de la sélection Double Chance:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ===== FONCTION DE TRAITEMENT DE MATCH AMÉLIORÉE =====
async function processMatchRobust(page, teamNames, href, strategy) {
  try {
    console.log(`🔍 Analyse: ${teamNames}`);
    
    // Naviguer directement avec l'URL du match
    const matchUrl = `https://www.betpawa.cm${href}`;
    console.log(`🌐 Navigation vers: ${matchUrl}`);
    
    await page.goto(matchUrl, { 
      waitUntil: "networkidle2", 
      timeout: 30000 
    });
    
    console.log("✅ Page du match chargée");

    // Sélectionner la stratégie appropriée
    let result;
    if (strategy === '1' || strategy.includes('double_chance')) {
      result = await selectDoubleChance(page);
    } else {
      result = { success: false, error: "Stratégie non implémentée" };
    }
    
    return result;

  } catch (error) {
    console.error("❌ Erreur lors du traitement du match:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ===== FONCTION DE PLACEMENT DE MISE =====
async function placerMise(page, montant) {
  try {
    console.log("💵 Début du placement de mise...");

    // 1. Récupérer le solde initial
    const soldeInitial = await recupererSolde(page);
    console.log(`💰 Solde initial: ${soldeInitial}`);

    if (soldeInitial < montant) {
      console.log("❌ Solde insuffisant pour cette mise");
      return false;
    }

    // 2. Attendre que le champ de mise soit disponible
    await page.waitForSelector("#betslip-form-stake-input", { timeout: 10000 });
    
    // 3. Effacer le champ et saisir le montant
    await page.focus("#betslip-form-stake-input");
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type("#betslip-form-stake-input", montant.toString(), { delay: 100 });
    
    console.log(`💰 Montant saisi: ${montant}`);

    // 4. Attendre et cliquer sur le bouton de placement
    await page.waitForSelector(".place-bet.button-primary", { timeout: 5000 });
    await page.click(".place-bet.button-primary");
    
    console.log("🎰 Pari en cours de placement...");
    
    // 5. Attendre le traitement (5 secondes pour être sûr)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 6. Vérifier le nouveau solde
    const nouveauSolde = await recupererSolde(page);
    console.log(`💰 Nouveau solde: ${nouveauSolde}`);

    // 7. Calculer la différence
    const difference = soldeInitial - nouveauSolde;
    console.log(`📊 Différence: ${difference.toFixed(2)}`);

    // 8. Vérifier si le montant a été prélevé (avec une petite tolérance)
    const tolerance = 0.1; // Tolérance de 0.1 pour les arrondis
    const miseReussie = Math.abs(difference - montant) <= tolerance;

    if (miseReussie) {
      console.log("✅ Pari confirmé ! Montant prélevé du solde.");
      console.log(`💵 Solde avant: ${soldeInitial} | Solde après: ${nouveauSolde}`);
      return true;
    } else {
      console.log("❌ Pari non confirmé - Solde inchangé");
      console.log("💭 Possible: limite de mise, erreur système, ou pari rejeté");
      return false;
    }

  } catch (error) {
    console.error("❌ Erreur lors du placement:", error.message);
    return false;
  }
}

// ===== FONCTION D'ARRÊT PROPRE =====
async function arreterApplication(browser, success = true) {
  console.log("\n" + "=".repeat(60));
  if (success) {
    console.log("🎉 MISSION ACCOMPLIE ! BOT TERMINÉ AVEC SUCCÈS");
  } else {
    console.log("⚠️ MISSION PARTIELLEMENT ACCOMPLIE");
  }
  console.log("=".repeat(60));
  
  console.log("📊 Fermeture du navigateur dans 5 secondes...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    await browser.close();
    console.log("✅ Navigateur fermé");
  } catch (error) {
    console.log("⚠️ Erreur fermeture navigateur:", error.message);
  }
  
  console.log("🛑 Application terminée");
  process.exit(success ? 0 : 1);
}

// ===== FONCTION DE DÉFILEMENT AUTOMATIQUE =====
async function autoScroll(page) {
  try {
    console.log("📜 Défilement pour charger plus de matchs...");
    
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let scrollPosition = 0;
        const scrollInterval = setInterval(() => {
          window.scrollBy(0, 800);
          scrollPosition += 800;

          if (scrollPosition >= 4000) {
            clearInterval(scrollInterval);
            resolve();
          }
        }, 300);
      });
    });
    
    await delay(5000); // Attendre que le contenu se charge
    console.log("✅ Défilement terminé");
    
  } catch (error) {
    console.log("⚠️ Erreur pendant le défilement:", error.message);
  }
}

// ===== FONCTION PRINCIPALE DE PARIS DOUBLE CHANCE CORRIGÉE =====
async function smartDoubleChanceBetting(page, targetOdds, coteMaxPari, modeAleatoire) {
  let currentTotal = 1;
  let selectedMatches = 0;
  let consecutiveNoMatches = 0;
  const MAX_CONSECUTIVE_NO_MATCHES = 3; // Réduit pour scroll plus tôt
  const usedMatches = new Set();
  const MAX_MATCHES = 15; // Limite pour éviter les boucles infinies

  console.log(`🎯 Stratégie: Double Chance`);
  console.log(`🎯 Objectif: ${targetOdds}x | Cote max: ${coteMaxPari}x`);
  console.log(`🎮 Mode: ${modeAleatoire ? 'ALÉATOIRE' : 'SÉQUENTIEL'}`);

  while (currentTotal < targetOdds && selectedMatches < MAX_MATCHES) {
    console.log(`\n🔢 Total actuel: ${currentTotal.toFixed(2)} (Objectif: ${targetOdds})`);
    console.log(`📊 Matchs sélectionnés: ${selectedMatches}`);

    try {
      // Retourner à la liste des matchs si nécessaire
      const currentUrl = page.url();
      if (!currentUrl.includes('events?marketId=1X2')) {
        console.log("🔙 Retour à la liste des matchs...");
        await page.goto("https://www.betpawa.cm/events?marketId=1X2&categoryId=2", {
          waitUntil: "networkidle2",
          timeout: 30000
        });
        await delay(3000);
      }

      // Attendre et récupérer les informations des matchs
      await page.waitForSelector('.game-event-wrapper', { timeout: 10000 });
      
      const matchesInfo = await page.evaluate(() => {
        const matches = Array.from(document.querySelectorAll('.game-event-wrapper'));
        return matches.map((match, index) => {
          try {
            const teams = Array.from(match.querySelectorAll('.scoreboard-participant-name'))
              .map(team => team.textContent.trim());
            const href = match.getAttribute('href');
            return { 
              teams: teams, 
              href: href,
              teamNames: teams.length >= 2 ? `${teams[0]} vs ${teams[1]}` : `match_${index}`,
              index: index
            };
          } catch (e) {
            return null;
          }
        }).filter(match => match !== null);
      });

      console.log(`📋 ${matchesInfo.length} matchs disponibles`);

      let foundValidMatch = false;

      for (const matchInfo of matchesInfo) {
        const matchKey = matchInfo.teamNames;
        
        if (usedMatches.has(matchKey)) {
          console.log(`⏭️ Match déjà traité: ${matchKey}`);
          continue;
        }

        const result = await processMatchRobust(page, matchInfo.teamNames, matchInfo.href, '1');

        if (result.success) {
          // CORRECTION: Utiliser <= au lieu de < pour inclure la limite exacte
          if (result.odds <= coteMaxPari) {
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
            console.log(`⚠️ Cote trop élevée: ${result.odds} > ${coteMaxPari} (ignoré)`);
            usedMatches.add(matchKey);
          }
        } else {
          usedMatches.add(matchKey); // Marquer comme traité même si échec
          console.log(`❌ Échec sur: ${matchKey} - ${result.error}`);
        }
      }

      if (!foundValidMatch) {
        consecutiveNoMatches++;
        console.log(`🔄 Aucun match valide trouvé (${consecutiveNoMatches}/${MAX_CONSECUTIVE_NO_MATCHES})`);
        
        if (consecutiveNoMatches >= MAX_CONSECUTIVE_NO_MATCHES) {
          console.log("📜 Tentative de scroll pour plus de matchs...");
          await autoScroll(page);
          consecutiveNoMatches = 0; // Reset le compteur après scroll
          usedMatches.clear(); // Effacer la liste pour permettre de re-tenter
        }
      } else {
        consecutiveNoMatches = 0;
      }

    } catch (error) {
      console.error("🚨 Erreur générale:", error.message);
      consecutiveNoMatches++;
      await delay(5000); // Attendre plus longtemps en cas d'erreur
    }
  }

  return {
    success: currentTotal >= targetOdds,
    totalOdds: currentTotal,
    selectedMatches,
    efficiency: ((currentTotal / targetOdds) * 100).toFixed(1),
    strategy: 'Double Chance'
  };
}

// ===== SCRIPT PRINCIPAL =====
(async () => {
  try {
    const config = await demanderParametres();

    const browser = await puppeteer.launch({
      headless: false,
      slowMo: 100, // Plus lent pour éviter les détachements
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    console.log("\n🚀 Lancement du navigateur...");
    await page.goto("https://www.betpawa.cm/", {
      waitUntil: "networkidle2",
    });

    // Étape 1: Connexion (si demandée)
    if (config.connexionAuto) {
      const connexionReussie = await connexionAutomatique(page);
      if (!connexionReussie) {
        console.log("❌ Arrêt du script - Connexion échouée");
        await browser.close();
        return;
      }
    } else {
      console.log("⏳ Connexion manuelle requise - Connectez-vous puis appuyez sur Entrée");
      await poserQuestion("Appuyez sur Entrée une fois connecté...");
    }

    // Étape 2: Navigation vers Football
    try {
      await page.waitForSelector('div.event-counter span.pointer', { timeout: 5000 });
      await page.click('div.event-counter span.pointer');
      console.log('✅ Clic sur "Tout voir Football"');
      await delay(3000);
    } catch {
      console.log('ℹ️ "Tout voir Football" non trouvé ou déjà sur la page');
    }

    // Étape 3: Sélection des paris selon la stratégie
    let result;
    
    if (config.strategie === "1") {
      console.log("🎯 Stratégie: Double Chance (Conservateur)");
      console.log("📋 Recherche des meilleurs paris Double Chance...\n");
      
      result = await smartDoubleChanceBetting(
        page, 
        config.coteTarget, 
        config.coteMaxPari, 
        config.modeAleatoire
      );
    } else {
      console.log("⚠️ Seule la stratégie Double Chance (Option 1) est implémentée dans cette version");
      await arreterApplication(browser, false);
      return;
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 RÉSULTATS DE LA SÉLECTION");
    console.log("=".repeat(60));
    console.log(`🎯 Stratégie: ${result.strategy}`);
    console.log(`🎯 Objectif: ${config.coteTarget}x`);
    console.log(`📈 Total atteint: ${result.totalOdds.toFixed(2)}x`);
    console.log(`⚖️ Cote max/pari: ${config.coteMaxPari}x`);
    console.log(`⚽ Matchs sélectionnés: ${result.selectedMatches}`);
    console.log(`🎮 Mode utilisé: ${config.modeAleatoire ? 'ALÉATOIRE' : 'SÉQUENTIEL'}`);
    console.log(`✅ Succès: ${result.success ? 'OUI 🎉' : 'NON ⚠️'}`);
    console.log(`📊 Efficacité: ${result.efficiency}%`);
    console.log("=".repeat(60));

    // Étape 4: Placement de mise (si objectif atteint)
    if (result.success && config.placementAuto) {
      console.log("\n🎰 PLACEMENT AUTOMATIQUE DE LA MISE");
      const miseReussie = await placerMise(page, config.montantMise);
      
      if (miseReussie) {
        console.log("🎉 SUCCÈS COMPLET ! Pari placé automatiquement !");
        await arreterApplication(browser, true);
      } else {
        console.log("⚠️ Erreur de placement - Vérifiez manuellement");
        console.log("💭 Le pari pourrait être en attente ou rejeté");
        await arreterApplication(browser, false);
      }
    } else if (result.success && !config.placementAuto) {
      console.log("\n💰 Objectif atteint ! Placement manuel activé");
      console.log(`Placez votre mise de ${config.montantMise} manuellement`);
      console.log("⏳ Le navigateur reste ouvert pour placement manuel");
      console.log("Appuyez sur Ctrl+C pour fermer quand terminé");
    } else {
      console.log("\n⚠️ Objectif non atteint, mais paris sélectionnés.");
      console.log("💭 Considérez ajuster les paramètres pour la prochaine fois.");
      await arreterApplication(browser, false);
    }

  } catch (error) {
    console.error("🚨 Erreur critique:", error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();