require("dotenv").config();
const puppeteer = require("puppeteer");
const readline = require("readline");

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
    if (['oui', 'o', 'yes', 'y', '1'].includes(input)) {
      connexionAuto = true;
    } else if (['non', 'n', 'no', '0'].includes(input)) {
      connexionAuto = false;
    } else {
      console.log("❌ Veuillez répondre par 'oui' ou 'non'");
      connexionAuto = null;
    }
  } while (connexionAuto === null);

  // 2. Choix de la stratégie
  console.log("\n📋 Choisissez une stratégie de paris :");
  console.log("1. Double chance (Conservateur)");
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
  console.log("Exemples : 1.5 (très sûr), 2.0 (équilibré), 3.0 (risqué)");
  
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
    if (['oui', 'o', 'yes', 'y', '1'].includes(input)) {
      modeAleatoire = true;
    } else if (['non', 'n', 'no', '0'].includes(input)) {
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
    if (['oui', 'o', 'yes', 'y', '1'].includes(input)) {
      placementAuto = true;
    } else if (['non', 'n', 'no', '0'].includes(input)) {
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
  
  if (!['oui', 'o', 'yes', 'y', '1'].includes(confirmation)) {
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

// ===== CLASSE STRATÉGIE ALÉATOIRE =====
class RandomBettingStrategy {
  constructor(coteMaxPari = 2.5) {
    this.usedMatches = new Set();
    this.strategies = ['conservative', 'balanced', 'aggressive'];
    this.currentStrategy = this.getRandomStrategy();
    this.consecutiveFailures = 0;
    this.maxOddsPerBet = coteMaxPari;
  }

  async getRandomValidMatches(page) {
    await page.waitForSelector(".event-bets", { timeout: 10000 });
    const allBets = await page.$$(".event-bets");
    const validMatches = [];

    for (let i = 0; i < allBets.length; i++) {
      const bet = allBets[i];
      
      try {
        const isSelected = await bet
          .evaluate((el) => !!el.querySelector(".event-bet.selected"))
          .catch(() => false);

        if (isSelected) continue;

        const teamNames = await bet.$eval('.event-name', el => el.textContent.trim()).catch(() => `match_${i}`);
        if (this.usedMatches.has(teamNames)) continue;

        const odds = await bet.$$eval(
          ".event-odds span:not(.svg-icon)",
          (els) => els.map((el) => parseFloat(el.textContent.replace(",", ".")) || Infinity)
        );

        if (odds.length >= 3) {
          const homeOdd = odds[0];
          const awayOdd = odds[2];
          const overGoalsOdd = odds.length > 3 ? odds[3] : null;

          if (homeOdd <= this.maxOddsPerBet || awayOdd <= this.maxOddsPerBet || (overGoalsOdd && overGoalsOdd <= this.maxOddsPerBet)) {
            validMatches.push({
              element: bet,
              index: i,
              teamNames,
              odds: { home: homeOdd, away: awayOdd, overGoals: overGoalsOdd },
              bestOdd: Math.min(homeOdd, awayOdd),
              riskLevel: this.calculateRiskLevel(homeOdd, awayOdd, overGoalsOdd)
            });
          }
        }
      } catch (error) {
        console.log(`⚠️ Erreur sur match ${i}:`, error.message);
      }
    }

    return this.shuffleArray(validMatches);
  }

  async getSequentialValidMatches(page) {
    await page.waitForSelector(".event-bets", { timeout: 10000 });
    const allBets = await page.$$(".event-bets");
    const validMatches = [];

    for (let i = 0; i < allBets.length; i++) {
      const bet = allBets[i];
      
      try {
        const isSelected = await bet
          .evaluate((el) => !!el.querySelector(".event-bet.selected"))
          .catch(() => false);

        if (isSelected) continue;

        const teamNames = await bet.$eval('.event-name', el => el.textContent.trim()).catch(() => `match_${i}`);
        if (this.usedMatches.has(teamNames)) continue;

        const odds = await bet.$$eval(
          ".event-odds span:not(.svg-icon)",
          (els) => els.map((el) => parseFloat(el.textContent.replace(",", ".")) || Infinity)
        );

        if (odds.length >= 3) {
          const homeOdd = odds[0];
          const awayOdd = odds[2];
          const overGoalsOdd = odds.length > 3 ? odds[3] : null;

          if (homeOdd <= this.maxOddsPerBet || awayOdd <= this.maxOddsPerBet || (overGoalsOdd && overGoalsOdd <= this.maxOddsPerBet)) {
            validMatches.push({
              element: bet,
              index: i,
              teamNames,
              odds: { home: homeOdd, away: awayOdd, overGoals: overGoalsOdd },
              bestOdd: Math.min(homeOdd, awayOdd),
              riskLevel: this.calculateRiskLevel(homeOdd, awayOdd, overGoalsOdd)
            });
          }
        }
      } catch (error) {
        console.log(`⚠️ Erreur sur match ${i}:`, error.message);
      }
    }

    return validMatches;
  }

  getRandomStrategy() {
    const strategies = ['conservative', 'balanced', 'aggressive', 'mixed'];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  selectMatchByStrategy(validMatches, strategy = this.currentStrategy, isRandom = true) {
    if (validMatches.length === 0) return null;

    if (!isRandom) {
      return validMatches.sort((a, b) => a.bestOdd - b.bestOdd)[0];
    }

    switch (strategy) {
      case 'conservative':
        return validMatches.sort((a, b) => a.bestOdd - b.bestOdd)[0];
      case 'aggressive':
        return validMatches.sort((a, b) => b.bestOdd - a.bestOdd)[0];
      case 'balanced':
        return this.weightedRandomSelection(validMatches);
      case 'mixed':
        const newStrategy = ['conservative', 'balanced', 'aggressive'][Math.floor(Math.random() * 3)];
        return this.selectMatchByStrategy(validMatches, newStrategy, isRandom);
      default:
        return validMatches[Math.floor(Math.random() * validMatches.length)];
    }
  }

  weightedRandomSelection(matches) {
    const weights = matches.map(match => 1 / match.bestOdd);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < matches.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return matches[i];
      }
    }
    
    return matches[matches.length - 1];
  }

  getRandomBetType(odds, choixUtilisateur) {
    const availableBets = [];
    
    switch (choixUtilisateur) {
      case "1": 
        if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
        if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
        break;
      case "2": 
        if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
        if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
        break;
      case "3": 
        if (odds.overGoals && odds.overGoals <= this.maxOddsPerBet) {
          availableBets.push({ type: 'over', odd: odds.overGoals, selector: '.over-goals .event-bet' });
        }
        if (availableBets.length === 0) {
          if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
          if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
        }
        break;
      case "4": 
      case "5": 
      case "6": 
        if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
        if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
        if (odds.overGoals && odds.overGoals <= this.maxOddsPerBet) {
          availableBets.push({ type: 'over', odd: odds.overGoals, selector: '.over-goals .event-bet' });
        }
        break;
      default:
        if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
        if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
    }
    
    if (availableBets.length === 0) return null;
    
    return this.weightedRandomSelection(availableBets.map(bet => ({
      ...bet,
      bestOdd: bet.odd
    })));
  }

  getBestBetType(odds, choixUtilisateur) {
    const availableBets = [];
    
    switch (choixUtilisateur) {
      case "1": 
      case "2": 
        if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
        if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
        break;
      case "3": 
        if (odds.overGoals && odds.overGoals <= this.maxOddsPerBet) {
          availableBets.push({ type: 'over', odd: odds.overGoals, selector: '.over-goals .event-bet' });
        }
        if (availableBets.length === 0) {
          if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
          if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
        }
        break;
      default:
        if (odds.home <= this.maxOddsPerBet) availableBets.push({ type: 'home', odd: odds.home, selector: '[data-test-id*="3744"] .event-bet' });
        if (odds.away <= this.maxOddsPerBet) availableBets.push({ type: 'away', odd: odds.away, selector: '[data-test-id*="3746"] .event-bet' });
    }
    
    if (availableBets.length === 0) return null;
    return availableBets.sort((a, b) => a.odd - b.odd)[0];
  }

  getRandomHumanDelay() {
    return Math.random() * 4000 + 1500; 
  }

  getRandomClickDelay() {
    return Math.random() * 1000 + 500; 
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  calculateRiskLevel(homeOdd, awayOdd, overGoalsOdd) {
    const minOdd = Math.min(homeOdd, awayOdd, overGoalsOdd || Infinity);
    if (minOdd <= 1.3) return 'low';
    if (minOdd <= 1.8) return 'medium';
    return 'high';
  }

  adaptStrategy(consecutiveFailures) {
    if (consecutiveFailures >= 3) {
      console.log("🔄 Adaptation: Changement de stratégie après échecs");
      this.currentStrategy = this.getRandomStrategy();
      return true;
    }
    return false;
  }
}

// ===== FONCTION PRINCIPALE =====
async function smartBetting(page, targetOdds, choixUtilisateur, coteMaxPari, modeAleatoire) {
  const strategy = new RandomBettingStrategy(coteMaxPari);
  let selectedMatches = 0;
  let consecutiveNoMatches = 0;
  let currentTotal = 1;
  const selectedOdds = [];
  const MAX_MATCHES = 20;
  const MAX_CONSECUTIVE_NO_MATCHES = 8;
  
  const strategyMap = {
    "1": "conservative",
    "2": "balanced", 
    "3": "balanced",
    "4": "aggressive",
    "5": "mixed",
    "6": "aggressive"
  };
  
  strategy.currentStrategy = strategyMap[choixUtilisateur] || "balanced";
  
  console.log(`🎯 Objectif: ${targetOdds}x | Cote max/pari: ${coteMaxPari}x`);
  console.log(`🎮 Stratégie: ${strategy.currentStrategy} | Mode: ${modeAleatoire ? 'ALÉATOIRE' : 'SÉQUENTIEL'}`);

  while (currentTotal < targetOdds && selectedMatches < MAX_MATCHES) {
    try {
      if (modeAleatoire) {
        await new Promise(resolve => setTimeout(resolve, strategy.getRandomHumanDelay()));
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const validMatches = modeAleatoire 
        ? await strategy.getRandomValidMatches(page)
        : await strategy.getSequentialValidMatches(page);
      
      if (validMatches.length === 0) {
        consecutiveNoMatches++;
        console.log(`🔄 Aucun match valide (${consecutiveNoMatches}/${MAX_CONSECUTIVE_NO_MATCHES})`);
        
        if (consecutiveNoMatches >= MAX_CONSECUTIVE_NO_MATCHES) {
          console.log("📜 Défilement pour chercher plus de matchs...");
          await autoScroll(page);
          consecutiveNoMatches = 0;
          if (modeAleatoire) strategy.adaptStrategy(consecutiveNoMatches);
        }
        continue;
      }

      const selectedMatch = strategy.selectMatchByStrategy(validMatches, strategy.currentStrategy, modeAleatoire);
      if (!selectedMatch) continue;

      const betChoice = modeAleatoire 
        ? strategy.getRandomBetType(selectedMatch.odds, choixUtilisateur)
        : strategy.getBestBetType(selectedMatch.odds, choixUtilisateur);
        
      if (!betChoice) {
        console.log(`⚠️ Aucun pari valide pour: ${selectedMatch.teamNames}`);
        continue;
      }

      console.log(`${modeAleatoire ? '🎲' : '📊'} Match: ${selectedMatch.teamNames}`);
      console.log(`📈 Pari: ${betChoice.type} @ ${betChoice.odd.toFixed(2)}`);

      if (modeAleatoire) {
        await new Promise(resolve => setTimeout(resolve, strategy.getRandomClickDelay()));
      } else {
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      const betButton = await selectedMatch.element.$(betChoice.selector);
      if (betButton) {
        await betButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));

        const isSelected = await betButton.evaluate(el => el.classList.contains("selected"));
        
        if (isSelected) {
          strategy.usedMatches.add(selectedMatch.teamNames);
          selectedOdds.push(betChoice.odd);
          currentTotal = selectedOdds.reduce((total, odd) => total * odd, 1);
          selectedMatches++;
          consecutiveNoMatches = 0;
          
          console.log(`✅ Pari ${selectedMatches}: ${betChoice.odd.toFixed(2)} | Total: ${currentTotal.toFixed(2)}`);
          
          if (modeAleatoire && selectedMatches % 3 === 0) {
            const oldStrategy = strategy.currentStrategy;
            strategy.currentStrategy = strategy.getRandomStrategy();
            console.log(`🔄 Stratégie: ${oldStrategy} → ${strategy.currentStrategy}`);
          }
          
          if (currentTotal >= targetOdds) {
            console.log(`🎯 Objectif ${targetOdds}x atteint ! Total: ${currentTotal.toFixed(2)}`);
            break;
          }
        } else {
          console.log(`❌ Échec de sélection pour: ${selectedMatch.teamNames}`);
          consecutiveNoMatches++;
        }
      }

    } catch (error) {
      console.error("🚨 Erreur dans la boucle:", error.message);
      consecutiveNoMatches++;
      if (modeAleatoire) strategy.adaptStrategy(consecutiveNoMatches);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  let finalTotal = currentTotal;
  try {
    const siteTotal = await page.$eval(
      '[data-test-id="totalOdds"]',
      (el) => parseFloat(el.textContent.replace(/[^\d,]/g, '').replace(",", ".")) || 1
    );
    if (siteTotal > currentTotal) {
      finalTotal = siteTotal;
      console.log(`🔍 Total corrigé par le site: ${finalTotal.toFixed(2)}`);
    }
  } catch (error) {
    console.log("ℹ️ Impossible de vérifier le total sur le site");
  }

  return {
    success: finalTotal >= targetOdds,
    totalOdds: finalTotal,
    selectedMatches,
    strategy: strategy.currentStrategy,
    targetReached: finalTotal >= targetOdds,
    efficiency: ((finalTotal / targetOdds) * 100).toFixed(1),
    mode: modeAleatoire ? 'ALÉATOIRE' : 'SÉQUENTIEL'
  };
}

// ===== FONCTION DE DÉFILEMENT =====
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let scrollPosition = 0;
      const scrollInterval = setInterval(() => {
        window.scrollBy(0, 500);
        scrollPosition += 500;

        if (scrollPosition >= 2500) {
          clearInterval(scrollInterval);
          resolve();
        }
      }, 200);
    });
  });
  await new Promise(resolve => setTimeout(resolve, 4000));
}

// ===== SCRIPT PRINCIPAL =====
(async () => {
  try {
    const config = await demanderParametres();

    const browser = await puppeteer.launch({
      headless: false,
      slowMo: 50,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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
    const toutVoirSelector = "div.event-counter span.pointer span:first-child";
    const toutVoirExists = await page.$(toutVoirSelector);
    
    if (toutVoirExists) {
      await page.click("div.event-counter span.pointer");
      console.log('✅ Clic sur "Tout voir Football" effectué.');

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Étape 3: Sélection des paris
      const result = await smartBetting(
        page, 
        config.coteTarget, 
        config.strategie, 
        config.coteMaxPari, 
        config.modeAleatoire
      );
      
      console.log("\n" + "=".repeat(60));
      console.log("📊 RÉSULTATS DE LA SÉLECTION");
      console.log("=".repeat(60));
      console.log(`🎯 Objectif: ${config.coteTarget}x`);
      console.log(`📈 Total atteint: ${result.totalOdds.toFixed(2)}x`);
      console.log(`⚖️ Cote max/pari: ${config.coteMaxPari}x`);
      console.log(`⚽ Matchs sélectionnés: ${result.selectedMatches}`);
      console.log(`🎮 Mode utilisé: ${result.mode}`);
      console.log(`🎯 Stratégie: ${result.strategy}`);
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

    } else {
      console.log('❌ "Tout voir Football" non trouvé.');
      await arreterApplication(browser, false);
    }

  } catch (error) {
    console.error("🚨 Erreur critique:", error.message);
    await arreterApplication(browser, false);
  }
})();