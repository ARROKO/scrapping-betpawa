require("dotenv").config();
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * Script intégré pour Betpawa:
 * - Connexion automatique ou manuelle
 * - Scraping de la liste des matchs
 * - Sélection des paris (double chance ou victoire simple)
 * - Mode de sélection continu ou aléatoire
 * - Placement des paris
 */

// Fonction pour vérifier si un match est dans le coupon de paris
async function checkMatchInBetslip(page, eventId) {
  console.log(`🔍 Vérification si le match ${eventId} est dans le coupon...`);
  
  const isInBetslip = await page.evaluate((eventId) => {
    // Chercher dans le coupon de paris
    const betslipBets = document.querySelectorAll('.betslip-bet');
    
    for (const bet of betslipBets) {
      // Chercher un lien vers cet événement dans le coupon
      const matchLink = bet.querySelector(`a[href="/event/${eventId}"]`);
      if (matchLink) {
        console.log(`Match ${eventId} trouvé dans le coupon:`, matchLink.textContent);
        return true;
      }
    }
    
    console.log(`Match ${eventId} non trouvé dans le coupon. Nombre de paris dans le coupon: ${betslipBets.length}`);
    return false;
  }, eventId);
  
  return isInBetslip;
}

// URL de la page des matchs
const MATCHES_URL = "https://www.betpawa.cm";

// Configuration pour le navigateur
const BROWSER_CONFIG = {
  headless: false, // Mode non-headless pour voir ce qui se passe
  defaultViewport: { width: 1366, height: 768 },
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
  slowMo: 100, // Plus lent pour éviter les détachements
};

// Configuration du temps d'attente (en ms)
const WAIT_CONFIG = {
  afterScroll: 1500,     // Temps d'attente après un défilement normal
  afterSpecialAction: 2500, // Temps d'attente après une action spéciale
  initialLoad: 5000,     // Temps d'attente pour le chargement initial
  scrollStep: 80,        // Intervalle entre les étapes de défilement progressif
  minWait: 800,          // Temps d'attente minimum entre les actions
  maxWait: 2000          // Temps d'attente maximum entre les actions
};

// Fonction pour attendre un délai
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Effectue un clic sur un élément avec réessais
 * @param {Object} page - Instance de la page Puppeteer
 * @param {string} selector - Sélecteur CSS de l'élément à cliquer
 * @param {number} maxAttempts - Nombre maximal de tentatives
 * @param {number} delayMs - Délai entre les tentatives
 * @returns {boolean} - Succès du clic
 */
async function clickWithRetry(page, selector, maxAttempts = 3, delayMs = 1000, checkSelected = false) {
  console.log(`👆 Tentative de clic sur: ${selector}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Vérifier si l'élément existe
      const elementExists = await page.evaluate((sel) => {
        return document.querySelector(sel) !== null;
      }, selector);
      
      if (!elementExists) {
        console.log(`⚠️ Tentative ${attempt}/${maxAttempts}: Élément non trouvé`);
        await delay(delayMs);
        continue;
      }
      
      // Vérifier si l'élément est visible
      const isVisible = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }, selector);
      
      if (!isVisible) {
        console.log(`⚠️ Tentative ${attempt}/${maxAttempts}: Élément non visible`);
        await delay(delayMs);
        continue;
      }
      
      // Faire défiler jusqu'à l'élément
      await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, selector);
      
      await delay(500); // Attendre que le défilement soit terminé
      
      // Cliquer sur l'élément
      await page.click(selector);
      console.log(`👉 Clic effectué sur ${selector} (tentative ${attempt}/${maxAttempts})`);
      
      // Si on doit vérifier que l'élément est sélectionné
      if (checkSelected) {
        await delay(1000); // Attendre que la sélection soit prise en compte
        
        // Vérifier que l'option est sélectionnée
        const isSelected = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (!element) return false;
          
          // Vérifier plusieurs classes possibles qui indiquent une sélection
          return element.classList.contains('selected') || 
                 element.classList.contains('active') || 
                 element.classList.contains('event-bet--selected') ||
                 element.hasAttribute('data-selected') ||
                 element.getAttribute('aria-selected') === 'true';
        }, selector);
        
        if (isSelected) {
          console.log(`✅ Option sélectionnée avec succès! (tentative ${attempt}/${maxAttempts})`);
          return true;
        } else {
          console.log(`⚠️ L'option n'est pas sélectionnée après le clic (tentative ${attempt}/${maxAttempts})`);
          if (attempt < maxAttempts) {
            await delay(delayMs);
            continue;
          }
        }
      } else {
        // Si on ne vérifie pas la sélection, on considère que c'est un succès
        console.log(`✅ Clic réussi sur ${selector}`);
        return true;
      }
    } catch (error) {
      console.log(`⚠️ Tentative ${attempt}/${maxAttempts} échouée: ${error.message}`);
      
      if (attempt === maxAttempts) {
        console.error(`❌ Échec après ${maxAttempts} tentatives de clic sur ${selector}`);
        return false;
      }
      
      await delay(delayMs);
    }
  }
  
  return false;
}

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

/**
 * Fonction pour demander les paramètres de configuration
 */
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
  
  let choixStrategie;
  do {
    choixStrategie = await poserQuestion("Votre choix (1-2) : ");
  } while (!['1', '2'].includes(choixStrategie));

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
  console.log(`🎮 Stratégie: Option ${choixStrategie} (${choixStrategie === '1' ? 'Double chance' : 'Juste victoire'})`);
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

/**
 * Fonction de connexion automatique
 */
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
    
    // Attendre un peu pour laisser la page se charger
    await delay(3000);
    
    // Attendre la connexion avec plusieurs sélecteurs possibles
    await page.waitForFunction(() => {
      // Vérifier plusieurs sélecteurs possibles pour le solde
      return document.querySelector('span.button.balance') !== null || 
             document.querySelector('.balance-amount') !== null || 
             document.querySelector('.header-buttons-authenticated .button.balance') !== null;
    }, { timeout: 20000 }); // Augmenter le timeout pour donner plus de temps
    
    // Attendre un peu plus pour s'assurer que tout est chargé
    await delay(1000);
    console.log("✅ Connexion réussie!");

    // Récupérer et afficher le solde
    const soldeNum = await getSolde(page);
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

/**
 * Récupère le solde du compte
 */
async function getSolde(page) {
  try {
    // Attendre que le solde soit visible avec plusieurs sélecteurs possibles
    await page.waitForFunction(() => {
      // Vérifier plusieurs sélecteurs possibles pour le solde
      return document.querySelector('span.button.balance') !== null || 
             document.querySelector('.balance-amount') !== null || 
             document.querySelector('.header-buttons-authenticated .button.balance') !== null;
    }, { timeout: 15000 });
    
    // Prendre une capture d'écran pour débogage (optionnel)
    // await page.screenshot({ path: 'balance-debug.png' });
    
    // Récupérer le solde avec plusieurs sélecteurs possibles
    const solde = await page.evaluate(() => {
      // Essayer plusieurs sélecteurs dans l'ordre de priorité
      const selectors = [
        'span.button.balance',
        '.header-buttons-authenticated .button.balance',
        '.balance-amount'
      ];
      
      let balanceElement = null;
      for (const selector of selectors) {
        balanceElement = document.querySelector(selector);
        if (balanceElement) break;
      }
      
      if (balanceElement) {
        const balanceText = balanceElement.textContent.trim();
        console.log('Texte du solde brut:', balanceText); // Debug
        
        // Extraire les chiffres du texte (format: "FCFA 490.00" ou similaire)
        const match = balanceText.match(/[\d,.]+/);
        if (match) {
          // Convertir en nombre (remplacer la virgule par un point si nécessaire)
          const valueStr = match[0].replace(/,/g, '.');
          const value = parseFloat(valueStr);
          console.log('Valeur extraite:', value);
          return value;
        }
      }
      return 0;
    });
    
    console.log(`💰 Solde actuel: ${solde}`);
    return solde;
  } catch (error) {
    console.warn('⚠️ Impossible de récupérer le solde:', error.message);
    return 0;
  }
}

/**
 * Fonction pour cliquer sur le bouton "Tout voir Football"
 */
async function clickToutVoirFootball(page) {
  console.log("🔍 Recherche du bouton 'Tout voir Football'...");
  
  try {
    // Attendre plus longtemps pour le chargement complet de la page
    await delay(WAIT_CONFIG.initialLoad * 1.5);
    
    // Méthode 1: Recherche par sélecteur spécifique et texte
    console.log("Méthode 1: Recherche par sélecteur spécifique et texte");
    let buttonFound = false;
    
    try {
      // Attendre que le bouton "Tout voir Football" soit disponible avec un timeout plus long
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll('.event-counter span.pointer, span.pointer, a.pointer, [role="button"]'));
          return elements.some(el => el.textContent && el.textContent.includes('Tout voir Football'));
        },
        { timeout: 8000 }
      );
      
      // Cliquer sur le bouton "Tout voir Football"
      buttonFound = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('.event-counter span.pointer, span.pointer, a.pointer, [role="button"]'));
        const footballButton = elements.find(el => el.textContent && el.textContent.includes('Tout voir Football'));
        if (footballButton) {
          console.log('Bouton "Tout voir Football" trouvé');
          // Scroll vers le bouton avant de cliquer
          footballButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Attendre un court instant avant de cliquer
          setTimeout(() => footballButton.click(), 500);
          return true;
        }
        return false;
      });
      
      // Attendre après le clic pour s'assurer que l'action est traitée
      await delay(1000);
    } catch (e) {
      console.log(`Méthode 1 a échoué: ${e.message}`);
    }
    
    // Méthode 2: Recherche par attribut data-v (plus générique)
    if (!buttonFound) {
      console.log("Méthode 2: Recherche par attribut data-v");
      try {
        buttonFound = await page.evaluate(() => {
          // Rechercher tous les éléments avec n'importe quel attribut data-v
          const elements = Array.from(document.querySelectorAll('[data-v-*]'));
          const footballButton = elements.find(el => {
            return el.textContent && el.textContent.includes('Tout voir Football');
          });
          
          if (footballButton) {
            console.log('Bouton "Tout voir Football" trouvé via data-v');
            footballButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => footballButton.click(), 500);
            return true;
          }
          return false;
        });
        
        // Attendre après le clic
        await delay(1000);
      } catch (e) {
        console.log(`Méthode 2 a échoué: ${e.message}`);
      }
    }
    
    // Méthode 3: Recherche par XPath plus exhaustive
    if (!buttonFound) {
      console.log("Méthode 3: Recherche par XPath");
      try {
        // XPath plus complet pour trouver le bouton
        const xpaths = [
          "//span[contains(text(), 'Tout voir Football')]",
          "//a[contains(text(), 'Tout voir Football')]",
          "//div[contains(text(), 'Tout voir Football')]",
          "//button[contains(text(), 'Tout voir Football')]",
          "//*/text()[contains(., 'Tout voir Football')]/parent::*"
        ];
        
        for (const xpath of xpaths) {
          const [button] = await page.$x(xpath);
          if (button) {
            // Scroll vers le bouton avant de cliquer
            await page.evaluate(el => {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, button);
            
            await delay(500);
            await button.click();
            buttonFound = true;
            console.log('Bouton "Tout voir Football" trouvé via XPath');
            break;
          }
        }
      } catch (e) {
        console.log(`Méthode 3 a échoué: ${e.message}`);
      }
    }
    
    // Méthode 4: Recherche par simulation de clic sur tous les éléments cliquables
    if (!buttonFound) {
      console.log("Méthode 4: Recherche par simulation de clic sur éléments cliquables");
      try {
        buttonFound = await page.evaluate(() => {
          // Chercher tous les éléments cliquables qui pourraient contenir le texte
          const clickableElements = Array.from(document.querySelectorAll('a, button, [role="button"], .clickable, .pointer'));
          
          // Filtrer pour trouver des éléments qui pourraient être liés au football
          const potentialButtons = clickableElements.filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('football') || text.includes('sport') || text.includes('tout voir');
          });
          
          // Cliquer sur chaque élément potentiel
          if (potentialButtons.length > 0) {
            console.log(`Trouvé ${potentialButtons.length} boutons potentiels liés au football`);
            potentialButtons[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => potentialButtons[0].click(), 500);
            return true;
          }
          return false;
        });
      } catch (e) {
        console.log(`Méthode 4 a échoué: ${e.message}`);
      }
    }
    
    return buttonFound;
  } catch (error) {
    console.log(`⚠️ Impossible de trouver ou cliquer sur 'Tout voir Football': ${error.message}`);
    return false;
  }
}

/**
 * Fonction pour défiler de manière progressive et simuler un comportement humain
 */
async function scrollProgressively(page) {
  await page.evaluate((config) => {
    return new Promise((resolve) => {
      let totalHeight = 0;
      // Distance variable pour simuler un comportement humain
      const getRandomDistance = () => Math.floor(Math.random() * 200) + 200; // Entre 200 et 400px
      const getRandomDelay = () => Math.floor(Math.random() * (config.maxWait - config.minWait)) + config.minWait;
      
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        const distance = getRandomDistance();
        
        // Simuler un mouvement de souris aléatoire pour paraître plus humain
        const mouseEvent = new MouseEvent('mousemove', {
          bubbles: true,
          clientX: Math.random() * window.innerWidth,
          clientY: Math.random() * window.innerHeight
        });
        document.dispatchEvent(mouseEvent);
        
        // Défilement avec une vitesse variable
        window.scrollBy({
          top: distance,
          behavior: 'smooth'
        });
        
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, config.scrollStep);
    });
  }, WAIT_CONFIG);
}

/**
 * Exécute une technique de défilement spécifique
 * @param {Object} page - Instance de la page Puppeteer
 * @param {number} techniqueNumber - Numéro de la technique à exécuter (0-3)
 * @param {string} containerSelector - Sélecteur du conteneur principal (optionnel)
 */
async function executeTechnique(page, techniqueNumber, containerSelector = null) {
  console.log(`🔄 Exécution de la technique ${techniqueNumber + 1}/4...`);
  
  switch (techniqueNumber) {
    case 0:
      // Technique 1: Défilement rapide jusqu'au bas avec rebond
      await page.evaluate(() => {
        // Défilement au bas de la page
        window.scrollTo(0, document.body.scrollHeight);
        
        // Après un court délai, remonter un peu puis redescendre (effet rebond)
        setTimeout(() => {
          window.scrollTo(0, document.body.scrollHeight * 0.8);
          setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 200);
        }, 300);
      });
      break;
      
    case 1:
      // Technique 2: Défilement par étapes avec pauses et interactions
      await page.evaluate(() => {
        const height = document.body.scrollHeight;
        
        // Simuler des clics aléatoires pendant le défilement
        const simulateRandomClicks = () => {
          // Trouver des éléments cliquables mais non critiques (pas les liens principaux)
          const nonCriticalElements = Array.from(document.querySelectorAll('.event-odds, .event-counter, .game-event-header'));
          if (nonCriticalElements.length > 0) {
            const randomElement = nonCriticalElements[Math.floor(Math.random() * nonCriticalElements.length)];
            randomElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          }
        };
        
        // Défilement par étapes avec interactions
        window.scrollTo(0, height * 0.3);
        setTimeout(() => simulateRandomClicks(), 150);
        setTimeout(() => window.scrollTo(0, height * 0.6), 300);
        setTimeout(() => simulateRandomClicks(), 450);
        setTimeout(() => window.scrollTo(0, height), 600);
      });
      break;
      
    case 2:
      // Technique 3: Cibler et interagir avec les derniers matchs
      await page.evaluate(() => {
        const matches = document.querySelectorAll('.game-events-container');
        if (matches.length > 0) {
          // Cibler les 5 derniers matchs
          const startIndex = Math.max(0, matches.length - 5);
          
          // Faire défiler vers le dernier match avec un effet de ralentissement
          const lastMatch = matches[matches.length - 1];
          lastMatch.scrollIntoView({ behavior: 'smooth', block: 'end' });
          
          // Simuler des interactions avec les derniers matchs
          setTimeout(() => {
            for (let i = startIndex; i < matches.length; i++) {
              const match = matches[i];
              const delay = (i - startIndex) * 100;
              
              setTimeout(() => {
                // Simuler un survol et un clic sur les cotes
                const odds = match.querySelectorAll('.event-odds span');
                if (odds.length > 0) {
                  const randomOdd = odds[Math.floor(Math.random() * odds.length)];
                  randomOdd.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  // Ne pas vraiment cliquer pour éviter de naviguer ailleurs
                }
              }, delay);
            }
          }, 200);
        }
      });
      break;
      
    case 3:
      // Technique 4: Interactions avancées avec le conteneur principal et défilement dynamique
      if (containerSelector) {
        await page.evaluate((selector) => {
          const container = document.querySelector(selector);
          if (container) {
            // Séquence d'interactions plus complexe
            const simulateHumanInteraction = () => {
              // Simuler des mouvements de souris
              for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                  container.dispatchEvent(new MouseEvent('mousemove', { 
                    bubbles: true,
                    clientX: Math.random() * window.innerWidth,
                    clientY: Math.random() * window.innerHeight
                  }));
                }, i * 100);
              }
              
              // Simuler un clic et un défilement
              container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              
              // Faire défiler avec une accélération progressive
              const startTime = Date.now();
              const duration = 800;
              const initialPosition = container.scrollTop || window.scrollY;
              const targetPosition = container.scrollHeight || document.body.scrollHeight;
              
              const scrollStep = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Fonction d'accélération
                const easeInOutCubic = progress < 0.5 ? 4 * progress**3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                
                const currentPosition = initialPosition + (targetPosition - initialPosition) * easeInOutCubic;
                
                if (typeof container.scrollTo === 'function') {
                  container.scrollTo(0, currentPosition);
                } else {
                  window.scrollTo(0, currentPosition);
                }
                
                if (progress < 1) {
                  requestAnimationFrame(scrollStep);
                }
              };
              
              requestAnimationFrame(scrollStep);
            };
            
            simulateHumanInteraction();
          }
        }, containerSelector);
      } else {
        // Technique alternative si le conteneur n'est pas trouvé
        await page.evaluate(() => {
          // Simuler un défilement avec accélération/décélération
          const scrollHeight = document.body.scrollHeight;
          const duration = 1000;
          const startTime = Date.now();
          const startPosition = window.scrollY;
          
          const scrollStep = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Fonction d'accélération/décélération
            const easeInOutQuad = progress < 0.5 ? 2 * progress**2 : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            window.scrollTo(0, startPosition + (scrollHeight - startPosition) * easeInOutQuad);
            
            if (progress < 1) {
              requestAnimationFrame(scrollStep);
            }
          };
          
          requestAnimationFrame(scrollStep);
        });
      }
      break;
  }
}

/**
 * Défile la page pour charger tous les matchs disponibles
 */
async function scrollToLoadAllMatches(page) {
  console.log("🔍 Chargement de tous les matchs disponibles...");
  
  // Conteneur principal des matchs
  const mainContainerSelector = '.game-events-container';
  
  // Nombre maximum de tentatives de défilement
  const MAX_SCROLL_ATTEMPTS = 15;
  // Nombre maximum de tentatives sans changement de hauteur
  const MAX_NO_CHANGE_ATTEMPTS = 5;
  
  let previousHeight = 0;
  let noChangeCount = 0;
  let scrollAttempts = 0;
  let matchCount = 0;
  let previousMatchCount = 0;
  
  while (scrollAttempts < MAX_SCROLL_ATTEMPTS && noChangeCount < MAX_NO_CHANGE_ATTEMPTS) {
    // Obtenir la hauteur actuelle de la page
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Compter le nombre de matchs actuellement chargés
    matchCount = await page.evaluate((selector) => {
      return document.querySelectorAll(selector).length;
    }, mainContainerSelector);
    
    console.log(`📊 Tentative ${scrollAttempts + 1}/${MAX_SCROLL_ATTEMPTS}: ${matchCount} matchs chargés`);
    
    // Vérifier si la hauteur a changé ou si de nouveaux matchs ont été chargés
    if (currentHeight === previousHeight && matchCount === previousMatchCount) {
      noChangeCount++;
      console.log(`⚠️ Aucun changement détecté (${noChangeCount}/${MAX_NO_CHANGE_ATTEMPTS})`);
    } else {
      noChangeCount = 0;
      console.log(`✅ Nouveaux contenus détectés: ${matchCount - previousMatchCount} nouveaux matchs`);
    }
    
    // Utiliser une technique de défilement différente à chaque itération pour éviter la détection
    const techniqueNumber = scrollAttempts % 4;
    await executeTechnique(page, techniqueNumber, mainContainerSelector);
    
    // Attendre que le contenu se charge
    await delay(WAIT_CONFIG.afterScroll);
    
    // Si nous avons fait plusieurs tentatives sans changement, essayer un défilement progressif
    if (noChangeCount >= 2 && noChangeCount < MAX_NO_CHANGE_ATTEMPTS - 1) {
      console.log("🔄 Essai de défilement progressif...");
      await scrollProgressively(page);
      await delay(WAIT_CONFIG.afterSpecialAction);
    }
    
    // Mettre à jour les valeurs précédentes
    previousHeight = currentHeight;
    previousMatchCount = matchCount;
    scrollAttempts++;
  }
  
  console.log(`🌟 Chargement terminé! ${matchCount} matchs chargés au total.`);
  return matchCount;
}

/**
 * Extrait les données des matchs de la page
 */
async function extractMatchData(page) {
  console.log("📊 Extraction des données des matchs...");
  
  const matchData = await page.evaluate(() => {
    const matches = [];
    const matchContainers = document.querySelectorAll('.game-events-container');
    
    matchContainers.forEach((container) => {
      try {
        // Extraire les informations de base du match
        const competitionElement = container.querySelector('.competition-name');
        const competition = competitionElement ? competitionElement.textContent.trim() : 'Compétition inconnue';
        
        const timeElement = container.querySelector('.event-time');
        const time = timeElement ? timeElement.textContent.trim() : 'Heure inconnue';
        
        // Extraire les équipes
        const teamElements = container.querySelectorAll('.event-name');
        const homeTeam = teamElements[0] ? teamElements[0].textContent.trim() : 'Équipe domicile inconnue';
        const awayTeam = teamElements[1] ? teamElements[1].textContent.trim() : 'Équipe extérieure inconnue';
        
        // Extraire les cotes
        const oddElements = container.querySelectorAll('.event-odds span');
        const odds = [];
        oddElements.forEach((oddElement) => {
          const oddValue = parseFloat(oddElement.textContent.trim());
          if (!isNaN(oddValue)) {
            odds.push(oddValue);
          }
        });
        
        // Extraire l'URL du match
        let matchUrl = '';
        const linkElement = container.querySelector('a');
        if (linkElement && linkElement.href) {
          matchUrl = linkElement.href;
        }
        
        // Créer l'objet match avec toutes les informations
        const match = {
          competition,
          time,
          homeTeam,
          awayTeam,
          odds,
          url: matchUrl,
          // Ajouter des champs pour les paris
          homeWinOdd: odds[0] || null,
          drawOdd: odds[1] || null,
          awayWinOdd: odds[2] || null,
          doubleChanceOdds: {
            homeOrDraw: null,  // 1X
            drawOrAway: null,  // X2
            homeOrAway: null   // 12
          }
        };
        
        // Calculer les cotes Double Chance si toutes les cotes principales sont disponibles
        if (match.homeWinOdd && match.drawOdd && match.awayWinOdd) {
          // Formule pour calculer les cotes Double Chance
          // 1X = (a * b) / (a + b) où a = cote 1, b = cote X
          match.doubleChanceOdds.homeOrDraw = parseFloat(((match.homeWinOdd * match.drawOdd) / (match.homeWinOdd + match.drawOdd)).toFixed(2));
          match.doubleChanceOdds.drawOrAway = parseFloat(((match.drawOdd * match.awayWinOdd) / (match.drawOdd + match.awayWinOdd)).toFixed(2));
          match.doubleChanceOdds.homeOrAway = parseFloat(((match.homeWinOdd * match.awayWinOdd) / (match.homeWinOdd + match.awayWinOdd)).toFixed(2));
        }
        
        matches.push(match);
      } catch (error) {
        console.error('Erreur lors de l\'extraction d\'un match:', error);
      }
    });
    
    return matches;
  });
  
  console.log(`✅ ${matchData.length} matchs extraits avec succès`);
  return matchData;
}

/**
 * Sélectionne les matchs pour parier en fonction des critères
 * @param {Array} matches - Liste des matchs disponibles
 * @param {Object} config - Configuration des paris
 * @returns {Array} - Liste des matchs sélectionnés pour parier
 */
function selectMatchesToBet(matches, config) {
  console.log("🎰 Sélection des matchs pour paris...");
  
  // Filtrer les matchs avec des cotes valides selon la stratégie
  let validMatches = matches.filter(match => {
    if (config.strategie === '1') { // Double chance
      // Vérifier que les cotes Double Chance sont disponibles
      return match.doubleChanceOdds.homeOrDraw !== null && 
             match.doubleChanceOdds.drawOrAway !== null && 
             match.doubleChanceOdds.homeOrAway !== null;
    } else { // Victoire simple
      // Vérifier que les cotes de victoire sont disponibles
      return match.homeWinOdd !== null && match.awayWinOdd !== null;
    }
  });
  
  // Filtrer les matchs selon la cote maximale par pari
  validMatches = validMatches.filter(match => {
    if (config.strategie === '1') { // Double chance
      // Prendre la cote la plus basse des options Double Chance
      const lowestDoubleChanceOdd = Math.min(
        match.doubleChanceOdds.homeOrDraw,
        match.doubleChanceOdds.drawOrAway,
        match.doubleChanceOdds.homeOrAway
      );
      return lowestDoubleChanceOdd <= config.coteMaxPari;
    } else { // Victoire simple
      // Prendre la cote la plus basse entre victoire domicile et extérieur
      const lowestWinOdd = Math.min(match.homeWinOdd, match.awayWinOdd);
      return lowestWinOdd <= config.coteMaxPari;
    }
  });
  
  console.log(`✅ ${validMatches.length} matchs valides pour paris trouvés`);
  
  // Si mode aléatoire, mélanger les matchs
  if (config.modeAleatoire) {
    console.log("🎲 Mode aléatoire activé, mélange des matchs...");
    validMatches = shuffleArray(validMatches);
  } else {
    console.log("🔰 Mode séquentiel activé, tri des matchs par cote...");
    // Trier par cote croissante (plus sûr d'abord)
    validMatches.sort((a, b) => {
      let oddA, oddB;
      
      if (config.strategie === '1') { // Double chance
        oddA = Math.min(
          a.doubleChanceOdds.homeOrDraw,
          a.doubleChanceOdds.drawOrAway,
          a.doubleChanceOdds.homeOrAway
        );
        oddB = Math.min(
          b.doubleChanceOdds.homeOrDraw,
          b.doubleChanceOdds.drawOrAway,
          b.doubleChanceOdds.homeOrAway
        );
      } else { // Victoire simple
        oddA = Math.min(a.homeWinOdd, a.awayWinOdd);
        oddB = Math.min(b.homeWinOdd, b.awayWinOdd);
      }
      
      return oddA - oddB;
    });
  }
  
  return validMatches;
}

/**
 * Mélange un tableau (algorithme de Fisher-Yates)
 */
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Sélectionne la meilleure option de double chance pour un match
 * @param {Object} page - Instance de la page Puppeteer
 * @param {Object} config - Configuration des paris avec côte maximale
 * @returns {Object} - Résultat de la sélection {success, option, cote}
 */
async function selectDoubleChance(page, config) {
  console.log(`🎯 Recherche de l'option Double Chance...`);
  
  try {
    // Vérifier si la page est bien chargée
    console.log(`🔍 Vérification de l'état de la page avant recherche Double Chance...`);
    const pageUrl = await page.url();
    console.log(`🌐 URL actuelle: ${pageUrl}`);
    
    // Attendre que la section Double Chance soit disponible
    console.log(`⏳ Attente de la section Double Chance [data-test-id="market-4693"]...`);
    await page.waitForSelector('[data-test-id="market-4693"]', { timeout: 15000 });
    console.log("✅ Section Double Chance trouvée!");
    
    // Prendre une capture d'écran pour débogage
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await page.screenshot({ path: `match-options-${timestamp}.png`, fullPage: false });
    console.log(`📷 Capture d'écran des options enregistrée: match-options-${timestamp}.png`);
    
    // Vérifier la présence des sélecteurs spécifiques avant d'extraire les données
    const selectorsPresent = await page.evaluate(() => {
      const selectors = [
        '[data-test-id="Odd-4693-4694"]',
        '[data-test-id="Odd-4693-4695"]',
        '[data-test-id="Odd-4693-4696"]'
      ];
      
      const results = {};
      selectors.forEach(selector => {
        const element = document.querySelector(selector);
        results[selector] = {
          exists: !!element,
          hasSelection: element && !!element.querySelector('.event-selection'),
          hasOdds: element && !!element.querySelector('.event-odds span:not(.svg-icon)')
        };
      });
      
      return results;
    });
    
    console.log(`📊 État des sélecteurs Double Chance:`);
    console.log(`- 1X [data-test-id="Odd-4693-4694"]: ${JSON.stringify(selectorsPresent['[data-test-id="Odd-4693-4694"]'])}`);
    console.log(`- X2 [data-test-id="Odd-4693-4695"]: ${JSON.stringify(selectorsPresent['[data-test-id="Odd-4693-4695"]'])}`);
    console.log(`- 12 [data-test-id="Odd-4693-4696"]: ${JSON.stringify(selectorsPresent['[data-test-id="Odd-4693-4696"]'])}`);
    
    // Récupérer les options disponibles avec les sélecteurs spécifiques
    const doubleChanceOptions = await page.evaluate(() => {
      const options = [];
      
      // 1X (Victoire à domicile ou match nul)
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
      
      // X2 (Match nul ou victoire à l'extérieur)
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
      
      // 12 (Victoire à domicile ou victoire à l'extérieur)
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
      console.log("❌ Aucune option Double Chance trouvée");
      return { success: false };
    }
    
    console.log(`✅ Options trouvées: ${doubleChanceOptions.map(o => `${o.selection} @${o.odds}`).join(', ')}`);
    
    // Filtrer les options selon la côte maximale
    const validOptions = doubleChanceOptions.filter(option => option.odds <= config.coteMaxPari);
    
    if (validOptions.length === 0) {
      console.log(`❌ Aucune option Double Chance sous la côte maximale ${config.coteMaxPari}`);
      return { success: false };
    }
    
    // Trouver l'option avec la cote la plus basse (plus sûre)
    const bestOption = validOptions.reduce((prev, current) => 
      current.odds < prev.odds ? current : prev
    );
    
    console.log(`💯 Meilleure option: ${bestOption.selection} @${bestOption.odds}`);
    
    // Cliquer sur la meilleure option avec la méthode de app5.js
    console.log(`🔥 Tentative de sélection de l'option ${bestOption.selection} avec la côte ${bestOption.odds}`);
    
    // Vérifier que l'élément est visible et cliquable
    const elementStatus = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { exists: false };
      
      const rect = element.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.left >= 0 && 
                       rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
      
      // Vérifier si l'élément est masqué par d'autres éléments
      const isClickable = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2) === element;
      
      return { 
        exists: true, 
        isVisible, 
        isClickable,
        position: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height
        }
      };
    }, bestOption.selector);
    
    console.log(`📊 État de l'élément à cliquer:`, JSON.stringify(elementStatus));
    
    // Si l'élément n'est pas visible, faire défiler jusqu'à lui
    if (elementStatus.exists && !elementStatus.isVisible) {
      console.log(`🚨 Élément existe mais n'est pas visible, défilement nécessaire`);
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, bestOption.selector);
      await delay(1000);
    }
    
    // Utiliser la méthode de clic avec vérification comme dans app5.js
    let clickSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`\n👉 Tentative ${attempt}/3 de cliquer sur l'option ${bestOption.selection}`);
        
        // Essayer de cliquer avec plusieurs méthodes
        if (attempt === 1) {
          // Méthode 1: Clic standard
          await page.click(bestOption.selector);
        } else if (attempt === 2) {
          // Méthode 2: Clic avec JavaScript
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.click();
              // Simuler aussi un événement de clic
              element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
          }, bestOption.selector);
        } else {
          // Méthode 3: Clic avec coordonnées
          const elementRect = await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
          }, bestOption.selector);
          
          if (elementRect) {
            await page.mouse.click(elementRect.x, elementRect.y);
          }
        }
        
        await delay(3000); // Attendre plus longtemps
        
        // Vérifier que l'option est sélectionnée
        const isSelected = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          
          // Vérifier plusieurs classes possibles qui indiquent une sélection
          const hasSelectedClass = element.classList.contains('selected');
          const hasActiveClass = element.classList.contains('active');
          const hasEventBetSelectedClass = element.classList.contains('event-bet--selected');
          const hasDataSelected = element.hasAttribute('data-selected');
          const hasAriaSelected = element.getAttribute('aria-selected') === 'true';
          
          console.log('Classes de l\'\u00e9l\u00e9ment:', element.className);
          console.log('Attributs de l\'\u00e9l\u00e9ment:', {
            'data-selected': element.getAttribute('data-selected'),
            'aria-selected': element.getAttribute('aria-selected')
          });
          
          return hasSelectedClass || hasActiveClass || hasEventBetSelectedClass || 
                 hasDataSelected || hasAriaSelected;
        }, bestOption.selector);

        if (isSelected) {
          clickSuccess = true;
          console.log("✅ Option Double Chance sélectionnée avec succès!");
          
          // Prendre une capture d'écran après sélection réussie
          const successTimestamp = new Date().toISOString().replace(/:/g, '-');
          await page.screenshot({ path: `selection-success-${successTimestamp}.png`, fullPage: false });
          console.log(`📷 Capture d'écran après sélection réussie: selection-success-${successTimestamp}.png`);
          
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
        option: bestOption.selection, 
        cote: bestOption.odds 
      };
    } else {
      throw new Error("Impossible de sélectionner l'option après plusieurs tentatives");
    }
    
  } catch (error) {
    console.error("❌ Erreur lors de la sélection Double Chance:", error.message);
    
    // Prendre une capture d'écran en cas d'erreur
    try {
      const errorTimestamp = new Date().toISOString().replace(/:/g, '-');
      await page.screenshot({ path: `error-double-chance-${errorTimestamp}.png`, fullPage: false });
      console.log(`📷 Capture d'écran de l'erreur: error-double-chance-${errorTimestamp}.png`);
    } catch (screenshotError) {
      console.log(`⚠️ Impossible de prendre une capture d'écran de l'erreur:`, screenshotError.message);
    }
    
    return { success: false };
  }
}

/**
 * Sélectionne la meilleure option de victoire simple (1, X, 2) directement depuis la liste des matchs
 * @param {Object} page - Instance de la page Puppeteer
 * @param {Object} match - Données du match avec l'ID de l'événement
 * @param {Object} config - Configuration des paris avec côte maximale
 * @returns {Promise<Object>} - Résultat de la sélection {success, option, cote}
 */
async function selectSingleWinFromList(page, match, config) {
  console.log(`🎯 Recherche de l'option Victoire Simple pour ${match.homeTeam} vs ${match.awayTeam}...`);
  
  try {
    // Vérifier si la page est bien chargée
    console.log(`🔍 Vérification de l'état de la page avant recherche Victoire Simple depuis la liste...`);
    const pageUrl = await page.url();
    console.log(`🌐 URL actuelle: ${pageUrl}`);
    
    // Extraire l'ID de l'événement depuis l'URL du match
    const eventId = match.url.split('/').pop();
    console.log(`🔑 ID de l'événement: ${eventId}`);
    console.log(`🎮 Match: ${match.homeTeam} vs ${match.awayTeam}`);
    
    // Chercher d'abord les sélecteurs dans le conteneur de l'événement
    const eventContainer = `[data-event-id="${eventId}"]`;
    
    // Attendre que le conteneur de l'événement soit disponible
    await page.waitForSelector(eventContainer, { timeout: 10000 });
    console.log(`✅ Conteneur de l'événement trouvé: ${eventContainer}`);
    
    // Les vrais sélecteurs basés sur l'analyse du HTML fourni
    // Le pattern est: Odd-{marketId}-{outcomeId} où marketId change selon l'événement
    // Nous devons d'abord identifier le marketId pour cet événement
    
    // Récupérer les sélecteurs dynamiques pour cet événement spécifique
    const selectors = await page.evaluate((eventId) => {
      const container = document.querySelector(`[data-event-id="${eventId}"]`);
      if (!container) return null;
      
      // Chercher tous les éléments avec data-test-id qui commencent par "Odd-"
      const oddElements = container.querySelectorAll('[data-test-id^="Odd-"]');
      const foundSelectors = {};
      
      oddElements.forEach(element => {
        const testId = element.getAttribute('data-test-id');
        const selectionElement = element.querySelector('.event-selection');
        const oddsElement = element.querySelector('.event-odds span:not(.svg-icon)');
        
        if (selectionElement && oddsElement) {
          const selection = selectionElement.textContent.trim();
          const odds = parseFloat(oddsElement.textContent.replace(',', '.'));
          
          if (selection === '1') {
            foundSelectors.selector1 = testId;
            foundSelectors.odds1 = odds;
          } else if (selection === 'X') {
            foundSelectors.selectorX = testId;
            foundSelectors.oddsX = odds;
          } else if (selection === '2') {
            foundSelectors.selector2 = testId;
            foundSelectors.odds2 = odds;
          }
        }
      });
      
      return foundSelectors;
    }, eventId);
    
    if (!selectors) {
      console.log(`❌ Impossible de trouver le conteneur pour l'événement ${eventId}`);
      return { success: false };
    }
    
    console.log(`📊 Sélecteurs trouvés pour l'événement ${eventId}:`);
    console.log(`- Option 1: ${selectors.selector1} @${selectors.odds1}`);
    console.log(`- Option X: ${selectors.selectorX} @${selectors.oddsX}`);
    console.log(`- Option 2: ${selectors.selector2} @${selectors.odds2}`);
    
    // Prendre une capture d'écran pour débogage
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await page.screenshot({ path: `match-debug-${timestamp}.png`, fullPage: false });
    console.log(`📷 Capture d'écran des options enregistrée: match-debug-${timestamp}.png`);
    
    // Mettre en évidence le match pour le débogage
    await page.evaluate((eventId) => {
      const elements = document.querySelectorAll(`[data-event-id="${eventId}"]`);
      console.log(`Éléments trouvés avec data-event-id=${eventId}: ${elements.length}`);
      elements.forEach(el => {
        el.style.border = '3px solid red';
        el.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
      });
    }, eventId);
    
    // Vérifier que nous avons au moins les options 1 et 2 (on exclut X pour victoire simple)
    if (!selectors.selector1 || !selectors.selector2) {
      console.log(`❌ Options de victoire simple incomplètes pour l'événement ${eventId}`);
      return { success: false };
    }
    
    // Créer les options disponibles basées sur les sélecteurs trouvés
    const singleWinOptions = [];
    
    // Option 1 (Victoire à domicile)
    if (selectors.selector1 && selectors.odds1) {
      singleWinOptions.push({
        selector: `[data-test-id="${selectors.selector1}"] .event-bet`,
        selection: '1',
        odds: selectors.odds1,
        type: '1'
      });
    }
    
    // Option 2 (Victoire à l'extérieur)
    if (selectors.selector2 && selectors.odds2) {
      singleWinOptions.push({
        selector: `[data-test-id="${selectors.selector2}"] .event-bet`,
        selection: '2',
        odds: selectors.odds2,
        type: '2'
      });
    }
    
    if (singleWinOptions.length === 0) {
      console.log("❌ Aucune option Victoire Simple trouvée dans la liste");
      return { success: false };
    }
    
    console.log(`✅ Options trouvées: ${singleWinOptions.map(o => `${o.selection} @${o.odds}`).join(', ')}`);
    
    // Filtrer les options selon la côte maximale et le type (1 ou 2, pas X)
    const validOptions = singleWinOptions.filter(option => 
      option.odds <= config.coteMaxPari && (option.type === '1' || option.type === '2')
    );
    
    if (validOptions.length === 0) {
      console.log(`❌ Aucune option Victoire Simple valide sous la côte maximale ${config.coteMaxPari}`);
      return { success: false };
    }
    
    // Trouver l'option avec la cote la plus basse (plus sûre)
    const bestOption = validOptions.reduce((prev, current) => 
      current.odds < prev.odds ? current : prev
    );
    
    console.log(`💯 Meilleure option: ${bestOption.selection} @${bestOption.odds}`);
    
    // Cliquer sur la meilleure option
    console.log(`🔥 Tentative de sélection de l'option ${bestOption.selection} avec la côte ${bestOption.odds}`);
    
    // Vérifier que l'élément est visible et cliquable
    const elementStatus = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { exists: false };
      
      const rect = element.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.left >= 0 && 
                       rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
      
      // Vérifier si l'élément est masqué par d'autres éléments
      const isClickable = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2) === element;
      
      return { 
        exists: true, 
        isVisible, 
        isClickable,
        position: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height
        }
      };
    }, bestOption.selector);
    
    console.log(`📊 État de l'élément à cliquer:`, JSON.stringify(elementStatus));
    
    // Si l'élément n'est pas visible, faire défiler jusqu'à lui
    if (elementStatus.exists && !elementStatus.isVisible) {
      console.log(`🚨 Élément existe mais n'est pas visible, défilement nécessaire`);
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, bestOption.selector);
      await delay(1000);
    }
    
    // Utiliser la méthode de clic avec vérification comme dans app5.js
    let clickSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`\n👉 Tentative ${attempt}/3 de cliquer sur l'option ${bestOption.selection}`);
        
        // Essayer de cliquer avec plusieurs méthodes
        if (attempt === 1) {
          // Méthode 1: Clic standard
          await page.click(bestOption.selector);
        } else if (attempt === 2) {
          // Méthode 2: Clic avec JavaScript
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.click();
              // Simuler aussi un événement de clic
              element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
          }, bestOption.selector);
        } else {
          // Méthode 3: Clic avec coordonnées
          const elementRect = await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
          }, bestOption.selector);
          
          if (elementRect) {
            await page.mouse.click(elementRect.x, elementRect.y);
          }
        }
        
        await delay(3000); // Attendre plus longtemps
        
        // Vérifier que l'option est sélectionnée
        const isSelected = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          
          // Vérifier plusieurs classes possibles qui indiquent une sélection
          const hasSelectedClass = element.classList.contains('selected');
          const hasActiveClass = element.classList.contains('active');
          const hasEventBetSelectedClass = element.classList.contains('event-bet--selected');
          const hasDataSelected = element.hasAttribute('data-selected');
          const hasAriaSelected = element.getAttribute('aria-selected') === 'true';
          
          console.log('Classes de l\'\u00e9l\u00e9ment:', element.className);
          console.log('Attributs de l\'\u00e9l\u00e9ment:', {
            'data-selected': element.getAttribute('data-selected'),
            'aria-selected': element.getAttribute('aria-selected')
          });
          
          return hasSelectedClass || hasActiveClass || hasEventBetSelectedClass || 
                 hasDataSelected || hasAriaSelected;
        }, bestOption.selector);

        if (isSelected) {
          clickSuccess = true;
          console.log("✅ Option Victoire Simple sélectionnée avec succès!");
          
          // Prendre une capture d'écran après sélection réussie
          const successTimestamp = new Date().toISOString().replace(/:/g, '-');
          await page.screenshot({ path: `selection-success-${successTimestamp}.png`, fullPage: false });
          console.log(`📷 Capture d'écran après sélection réussie: selection-success-${successTimestamp}.png`);
          
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
        option: bestOption.selection, 
        cote: bestOption.odds 
      };
    } else {
      throw new Error("Impossible de sélectionner l'option après plusieurs tentatives");
    }
    
  } catch (error) {
    console.error("❌ Erreur lors de la sélection Victoire Simple depuis la liste:", error.message);
    
    // Prendre une capture d'écran en cas d'erreur
    try {
      const errorTimestamp = new Date().toISOString().replace(/:/g, '-');
      await page.screenshot({ path: `error-single-win-list-${errorTimestamp}.png`, fullPage: false });
      console.log(`📷 Capture d'écran de l'erreur: error-single-win-list-${errorTimestamp}.png`);
    } catch (screenshotError) {
      console.log(`⚠️ Impossible de prendre une capture d'écran de l'erreur:`, screenshotError.message);
    }
    
    return { success: false };
  }
}

/**
 * Sélectionne la meilleure option de victoire simple pour un match
 * @param {Object} page - Instance de la page Puppeteer
 * @param {Object} config - Configuration des paris avec côte maximale
 * @returns {Object} - Résultat de la sélection {success, option, cote}
 */
async function selectSingleWin(page, config) {
  console.log("🎯 Recherche de l'option Victoire Simple...");
  
  try {
    // Vérifier si la page est bien chargée
    console.log(`🔍 Vérification de l'état de la page avant recherche Victoire Simple...`);
    const pageUrl = await page.url();
    console.log(`🌐 URL actuelle: ${pageUrl}`);
    
    // Attendre que la section 1X2 soit disponible
    console.log(`⏳ Attente de la section 1X2 [data-test-id="market-4703"]...`);
    await page.waitForSelector('[data-test-id="market-4703"]', { timeout: 15000 });
    console.log("✅ Section 1X2 trouvée!");
    
    // Prendre une capture d'écran pour débogage
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await page.screenshot({ path: `match-options-${timestamp}.png`, fullPage: false });
    console.log(`📷 Capture d'écran des options enregistrée: match-options-${timestamp}.png`);
    
    // Définir les sélecteurs pour les options 1X2
    const selector1 = '[data-test-id="Odd-4703-4704"]'; // 1
    const selectorX = '[data-test-id="Odd-4703-4705"]'; // X
    const selector2 = '[data-test-id="Odd-4703-4706"]'; // 2
    
    console.log(`⏳ Attente des sélecteurs pour les options de pari:`);
    console.log(`- Option 1: ${selector1}`);
    console.log(`- Option X: ${selectorX}`);
    console.log(`- Option 2: ${selector2}`);
    
    // Attendre qu'au moins une des options soit disponible
    const results = await Promise.allSettled([
      page.waitForSelector(selector1, { timeout: 5000 }),
      page.waitForSelector(selectorX, { timeout: 5000 }),
      page.waitForSelector(selector2, { timeout: 5000 })
    ]);
    
    console.log(`📊 Résultats de l'attente des sélecteurs:`);
    console.log(`- Option 1: ${results[0].status === 'fulfilled' ? '✅ Trouvée' : '❌ Non trouvée'}`);
    console.log(`- Option X: ${results[1].status === 'fulfilled' ? '✅ Trouvée' : '❌ Non trouvée'}`);
    console.log(`- Option 2: ${results[2].status === 'fulfilled' ? '✅ Trouvée' : '❌ Non trouvée'}`);
    
    // Mettre en évidence les options pour le débogage
    await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-test-id^="Odd-4703-470"]');
      console.log(`Éléments trouvés avec data-test-id^="Odd-4703-470": ${elements.length}`);
      elements.forEach(el => {
        el.style.border = '3px solid red';
        el.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
      });
    });
    
    // Vérifier la présence des sélecteurs spécifiques avant d'extraire les données
    const selectorsPresent = await page.evaluate(() => {
      const selectors = [
        '[data-test-id="Odd-4703-4704"]', // 1
        '[data-test-id="Odd-4703-4705"]', // X
        '[data-test-id="Odd-4703-4706"]'  // 2
      ];
      
      const results = {};
      selectors.forEach(selector => {
        const element = document.querySelector(selector);
        results[selector] = {
          exists: !!element,
          hasSelection: element && !!element.querySelector('.event-selection'),
          hasOdds: element && !!element.querySelector('.event-odds span:not(.svg-icon)')
        };
      });
      
      return results;
    });
    
    console.log(`📊 État des sélecteurs Victoire Simple:`);
    console.log(`- 1 [data-test-id="Odd-4703-4704"]: ${JSON.stringify(selectorsPresent['[data-test-id="Odd-4703-4704"]'])}`);
    console.log(`- X [data-test-id="Odd-4703-4705"]: ${JSON.stringify(selectorsPresent['[data-test-id="Odd-4703-4705"]'])}`);
    console.log(`- 2 [data-test-id="Odd-4703-4706"]: ${JSON.stringify(selectorsPresent['[data-test-id="Odd-4703-4706"]'])}`);
    
    // Récupérer les options disponibles avec les sélecteurs spécifiques
    const singleWinOptions = await page.evaluate(() => {
      const options = [];
      
      // 1 (Victoire à domicile)
      const bet1 = document.querySelector('[data-test-id="Odd-4703-4704"]');
      if (bet1) {
        const selection = bet1.querySelector('.event-selection');
        const oddsSpan = bet1.querySelector('.event-odds span:not(.svg-icon)');
        if (selection && oddsSpan) {
          options.push({
            selector: '[data-test-id="Odd-4703-4704"] .event-bet',
            selection: selection.textContent.trim(),
            odds: parseFloat(oddsSpan.textContent.replace(',', '.')),
            type: '1' // Victoire à domicile
          });
        }
      }
      
      // X (Match nul)
      const betX = document.querySelector('[data-test-id="Odd-4703-4705"]');
      if (betX) {
        const selection = betX.querySelector('.event-selection');
        const oddsSpan = betX.querySelector('.event-odds span:not(.svg-icon)');
        if (selection && oddsSpan) {
          options.push({
            selector: '[data-test-id="Odd-4703-4705"] .event-bet',
            selection: selection.textContent.trim(),
            odds: parseFloat(oddsSpan.textContent.replace(',', '.')),
            type: 'X' // Match nul
          });
        }
      }
      
      // 2 (Victoire à l'extérieur)
      const bet2 = document.querySelector('[data-test-id="Odd-4703-4706"]');
      if (bet2) {
        const selection = bet2.querySelector('.event-selection');
        const oddsSpan = bet2.querySelector('.event-odds span:not(.svg-icon)');
        if (selection && oddsSpan) {
          options.push({
            selector: '[data-test-id="Odd-4703-4706"] .event-bet',
            selection: selection.textContent.trim(),
            odds: parseFloat(oddsSpan.textContent.replace(',', '.')),
            type: '2' // Victoire à l'extérieur
          });
        }
      }
      
      return options;
    });
    
    if (singleWinOptions.length === 0) {
      console.log("❌ Aucune option Victoire Simple trouvée");
      return { success: false };
    }
    
    console.log(`✅ Options trouvées: ${singleWinOptions.map(o => `${o.selection} (${o.type}) @${o.odds}`).join(', ')}`);
    
    // Filtrer les options selon la côte maximale et le type (1 ou 2, pas X)
    const validOptions = singleWinOptions.filter(option => 
      option.odds <= config.coteMaxPari && (option.type === '1' || option.type === '2')
    );
    
    if (validOptions.length === 0) {
      console.log(`❌ Aucune option Victoire Simple valide sous la côte maximale ${config.coteMaxPari}`);
      return { success: false };
    }
    
    // Trouver l'option avec la cote la plus basse (plus sûre)
    const bestOption = validOptions.reduce((prev, current) => 
      current.odds < prev.odds ? current : prev
    );
    
    console.log(`💯 Meilleure option: ${bestOption.selection} (${bestOption.type}) @${bestOption.odds}`);
    
    // Cliquer sur la meilleure option
    console.log(`🔥 Tentative de sélection de l'option ${bestOption.selection} avec la côte ${bestOption.odds}`);
    
    // Vérifier que l'élément est visible et cliquable
    const elementStatus = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { exists: false };
      
      const rect = element.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.left >= 0 && 
                       rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
      
      // Vérifier si l'élément est masqué par d'autres éléments
      const isClickable = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2) === element;
      
      return { 
        exists: true, 
        isVisible, 
        isClickable,
        position: {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
          width: rect.width,
          height: rect.height
        }
      };
    }, bestOption.selector);
    
    console.log(`📊 État de l'élément à cliquer:`, JSON.stringify(elementStatus));
    
    // Si l'élément n'est pas visible, faire défiler jusqu'à lui
    if (elementStatus.exists && !elementStatus.isVisible) {
      console.log(`🚨 Élément existe mais n'est pas visible, défilement nécessaire`);
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, bestOption.selector);
      await delay(1000);
    }
    
    // Utiliser la méthode de clic avec vérification comme dans app5.js
    let clickSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`\n👉 Tentative ${attempt}/3 de cliquer sur l'option ${bestOption.selection}`);
        
        // Essayer de cliquer avec plusieurs méthodes
        if (attempt === 1) {
          // Méthode 1: Clic standard
          await page.click(bestOption.selector);
        } else if (attempt === 2) {
          // Méthode 2: Clic avec JavaScript
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.click();
              // Simuler aussi un événement de clic
              element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
          }, bestOption.selector);
        } else {
          // Méthode 3: Clic avec coordonnées
          const elementRect = await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
          }, bestOption.selector);
          
          if (elementRect) {
            await page.mouse.click(elementRect.x, elementRect.y);
          }
        }
        
        await delay(3000); // Attendre plus longtemps
        
        // Vérifier que l'option est sélectionnée
        const isSelected = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          
          // Vérifier plusieurs classes possibles qui indiquent une sélection
          const hasSelectedClass = element.classList.contains('selected');
          const hasActiveClass = element.classList.contains('active');
          const hasEventBetSelectedClass = element.classList.contains('event-bet--selected');
          const hasDataSelected = element.hasAttribute('data-selected');
          const hasAriaSelected = element.getAttribute('aria-selected') === 'true';
          
          console.log('Classes de l\'\u00e9l\u00e9ment:', element.className);
          console.log('Attributs de l\'\u00e9l\u00e9ment:', {
            'data-selected': element.getAttribute('data-selected'),
            'aria-selected': element.getAttribute('aria-selected')
          });
          
          return hasSelectedClass || hasActiveClass || hasEventBetSelectedClass || 
                 hasDataSelected || hasAriaSelected;
        }, bestOption.selector);

        if (isSelected) {
          clickSuccess = true;
          console.log("✅ Option Victoire Simple sélectionnée avec succès!");
          
          // Prendre une capture d'écran après sélection réussie
          const successTimestamp = new Date().toISOString().replace(/:/g, '-');
          await page.screenshot({ path: `selection-success-${successTimestamp}.png`, fullPage: false });
          console.log(`📷 Capture d'écran après sélection réussie: selection-success-${successTimestamp}.png`);
          
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
        option: bestOption.selection, 
        cote: bestOption.odds 
      };
    } else {
      throw new Error("Impossible de sélectionner l'option après plusieurs tentatives");
    }
    
  } catch (error) {
    console.error("❌ Erreur lors de la sélection Victoire Simple:", error.message);
    
    // Prendre une capture d'écran en cas d'erreur
    try {
      const errorTimestamp = new Date().toISOString().replace(/:/g, '-');
      await page.screenshot({ path: `error-single-win-${errorTimestamp}.png`, fullPage: false });
      console.log(`📷 Capture d'écran de l'erreur: error-single-win-${errorTimestamp}.png`);
    } catch (screenshotError) {
      console.log(`⚠️ Impossible de prendre une capture d'écran de l'erreur:`, screenshotError.message);
    }
    
    return { success: false };
  }
}

/**
 * Traite un match pour placer un pari selon la stratégie choisie
 * @param {Object} page - Instance de la page Puppeteer
 * @param {Object} match - Données du match
 * @param {Object} config - Configuration des paris
 * @returns {Object} - Résultat du traitement {success, cote}
 */
async function processMatch(page, match, config) {
  console.log(`\n🏆 Traitement du match: ${match.homeTeam} vs ${match.awayTeam}`);
  console.log(`⏰ Heure: ${match.time} | 🏁 Compétition: ${match.competition}`);
  
  try {
    let result;
    
    // Pour la stratégie Victoire Simple, sélectionner directement depuis la liste des matchs
    if (config.strategie === '2') { // '2' correspond à "Juste victoire"
      console.log("📍 Stratégie: Victoire Simple directement depuis la liste");
      result = await selectSingleWinFromList(page, match, config);
      
      if (result.success) {
        console.log(`✅ Option sélectionnée avec succès depuis la liste: ${result.option} @${result.cote}`);
        return { 
          success: true,
          cote: result.cote,
          option: result.option
        };
      } else {
        console.log("⚠️ Impossible de sélectionner l'option depuis la liste");
        return { success: false };
      }
    }
    
    // Pour Double Chance, naviguer vers la page du match
    console.log(`🔎 Navigation vers: ${match.url}`);
    await page.goto(match.url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Attendre que la page soit complètement chargée
    await delay(3000); // Réduire le délai pour accélérer le processus
    
    // Attendre que le contenu principal soit chargé
    try {
      await page.waitForSelector('.event-container', { timeout: 10000 });
      console.log("✅ Page du match chargée");
    } catch (error) {
      console.log("⚠️ Timeout en attendant le conteneur de l'événement");
    }
    
    // Prendre une capture d'écran pour débogage
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await page.screenshot({ path: `match-debug-${timestamp}.png`, fullPage: false });
    console.log(`📷 Capture d'écran de débogage enregistrée`);
    
    // Vérifier si la page contient les éléments attendus
    const pageStatus = await page.evaluate(() => {
      // Vérifier les marchés disponibles
      const market1 = document.querySelector('[data-test-id="market-1"]');
      const market4693 = document.querySelector('[data-test-id="market-4693"]');
      
      // Vérifier les options de paris
      const singleWinOptions = [
        document.querySelector('[data-test-id="Odd-1-1"]'),
        document.querySelector('[data-test-id="Odd-1-2"]'),
        document.querySelector('[data-test-id="Odd-1-3"]')
      ];
      
      const doubleChanceOptions = [
        document.querySelector('[data-test-id="Odd-4693-4694"]'),
        document.querySelector('[data-test-id="Odd-4693-4695"]'),
        document.querySelector('[data-test-id="Odd-4693-4696"]')
      ];
      
      // Vérifier également les sélecteurs alternatifs qui pourraient être utilisés
      const alternativeSingleWinOptions = document.querySelectorAll('.event-bet');
      const alternativeDoubleChanceOptions = document.querySelectorAll('.market-option');
      
      // Collecter les classes et IDs pour débogage
      const allMarkets = Array.from(document.querySelectorAll('[data-test-id*="market-"]'))
        .map(el => el.getAttribute('data-test-id'));
      
      return { 
        hasMarket1: !!market1, 
        hasMarket4693: !!market4693,
        singleWinOptionsCount: singleWinOptions.filter(Boolean).length,
        doubleChanceOptionsCount: doubleChanceOptions.filter(Boolean).length,
        alternativeSingleWinOptionsCount: alternativeSingleWinOptions.length,
        alternativeDoubleChanceOptionsCount: alternativeDoubleChanceOptions.length,
        allMarkets: allMarkets.slice(0, 10) // Limiter à 10 pour éviter des logs trop longs
      };
    });
    
    console.log(`🔍 Détection des marchés:`);
    console.log(`- 1X2 (market-1): ${pageStatus.hasMarket1 ? '✅ Présent' : '❌ Absent'}`);
    console.log(`- Double Chance (market-4693): ${pageStatus.hasMarket4693 ? '✅ Présent' : '❌ Absent'}`);
    console.log(`- Options Victoire Simple détectées: ${pageStatus.singleWinOptionsCount}/3`);
    console.log(`- Options Double Chance détectées: ${pageStatus.doubleChanceOptionsCount}/3`);
    console.log(`- Options alternatives: Simple: ${pageStatus.alternativeSingleWinOptionsCount}, Double: ${pageStatus.alternativeDoubleChanceOptionsCount}`);
    console.log(`- Marchés disponibles: ${pageStatus.allMarkets.join(', ')}`);
    
    // Si les sélecteurs standard ne fonctionnent pas, essayons de faire défiler la page
    if (!pageStatus.hasMarket1 && !pageStatus.hasMarket4693) {
      console.log("🔴 Aucun marché détecté, tentative de défilement...");
      await page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      await delay(2000);
    }
    
    // Sélectionner l'option selon la stratégie choisie (seulement Double Chance ici)
    if (config.strategie === '1') { // '1' correspond à "Double chance"
      console.log("📍 Stratégie: Double Chance");
      result = await selectDoubleChance(page, config);
    } else {
      console.log("❌ Erreur: Cette partie du code ne devrait être atteinte que pour Double Chance");
      return { success: false };
    }
    
    if (!result.success) {
      console.log("❌ Échec de la sélection de l'option de pari");
      return { success: false };
    }
    
    console.log(`✅ Option sélectionnée avec succès: ${result.option} @${result.cote}`);
    
    // Vérifier si la cote est dans la plage acceptable
    if (result.cote < config.coteTarget || result.cote > config.coteMaxPari) {
      console.log(`⚠️ Cote ${result.cote} hors plage [${config.coteTarget} - ${config.coteMaxPari}]`);
      return { success: false };
    }
    
    // Si le placement automatique est activé, placer le pari
    if (config.placementAuto) {
      console.log("💰 Placement automatique activé");
      const betResult = await placeBet(page, config.montantMise);
      if (betResult.success) {
        console.log(`✅ Pari placé avec succès: ${config.montantMise} sur ${result.option} @${result.cote}`);
      } else {
        console.log("❌ Échec du placement du pari");
        return { success: false };
      }
    } else {
      console.log("ℹ️ Placement automatique désactivé, attente de l'action utilisateur");
      // Attendre que l'utilisateur place manuellement le pari
      await delay(10000);
    }
    
    return { 
      success: true,
      cote: result.cote
    };
    
  } catch (error) {
    console.error(`❌ Erreur lors du traitement du match: ${error.message}`);
    return { success: false };
  }
}

/**
 * Place un pari avec le montant spécifié
 * @param {Object} page - Instance de la page Puppeteer
 * @param {number} amount - Montant du pari
 * @returns {boolean} - Succès du placement du pari
 */
async function placeBet(page, amount) {
  console.log(`💰 Placement du pari: ${amount}`);
  
  try {
    // Vérifier que le coupon est visible
    await page.waitForSelector('.betslip-container', { timeout: 15000 });
    
    // Effacer le champ de mise et saisir le montant avec réessais
    let inputSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.focus('#betslip-form-stake-input');
        await page.evaluate(() => document.querySelector('#betslip-form-stake-input').value = '');
        await page.type('#betslip-form-stake-input', amount.toString());
        
        // Vérifier que le montant a bien été saisi
        const inputValue = await page.evaluate(() => {
          const input = document.querySelector('#betslip-form-stake-input');
          return input ? input.value : '';
        });
        
        if (inputValue === amount.toString()) {
          console.log(`✅ Montant saisi correctement: ${amount}`);
          inputSuccess = true;
          break;
        } else {
          console.log(`⚠️ Tentative ${attempt}/3 - Montant non saisi correctement: ${inputValue}`);
          await delay(1000);
        }
      } catch (error) {
        console.log(`⚠️ Tentative ${attempt}/3 - Erreur de saisie: ${error.message}`);
        await delay(1000);
      }
    }
    
    if (!inputSuccess) {
      throw new Error("Impossible de saisir le montant après plusieurs tentatives");
    }
    
    // Attendre et cliquer sur le bouton de placement avec notre fonction améliorée
    const clickSuccess = await clickWithRetry(page, '.place-bet.button-primary', 5, 2000);
    
    if (!clickSuccess) {
      throw new Error("Impossible de cliquer sur le bouton de placement du pari");
    }
    
    console.log('🎰 Pari en cours de placement...');
    
    // Attendre la confirmation du pari
    try {
      await page.waitForSelector('.betslip-receipt', { timeout: 15000 });
      console.log('✅ Pari placé avec succès!');
      
      // Prendre une capture d'écran de la confirmation
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      await page.screenshot({ path: `bet-confirmation-${timestamp}.png`, fullPage: false });
      console.log(`📷 Capture d'écran de la confirmation enregistrée`);
      
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la confirmation du pari:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur lors du placement du pari:', error.message);
    return false;
  }
}

/**
 * Exécute le processus complet de paris
 * @param {Object} page - Instance de la page Puppeteer
 * @param {Array} matches - Liste des matchs disponibles
 * @param {Object} config - Configuration des paris
 * @returns {Object} - Résultat du processus {success, parisPlaces}
 */
async function executeBettingProcess(page, matches, config) {
  console.log(`\n🎮 Démarrage du processus de paris...`);
  console.log(`💸 Montant par pari: ${config.montantMise}`);
  console.log(`📊 Stratégie: ${config.strategie === '1' ? 'Double Chance' : 'Victoire Simple'}`);
  console.log(`🎲 Mode: ${config.modeAleatoire ? 'Aléatoire' : 'Séquentiel'}`);
  
  // Sélectionner les matchs pour parier
  const matchesToBet = selectMatchesToBet(matches, config);
  
  if (matchesToBet.length === 0) {
    console.log(`❌ Aucun match ne correspond aux critères de paris.`);
    return { success: false, parisPlaces: 0 };
  }
  
  console.log(`📍 ${matchesToBet.length} matchs sélectionnés pour paris.`);
  
  
  // Statistiques des sélections
  const stats = {
    selections: [],
    coteTotal: 1,
    selectionsReussies: 0,
    selectionsEchouees: 0
  };
  
  // Sélectionner les matchs jusqu'à atteindre la cote cible
  for (const match of matchesToBet) {
    console.log(`\n🏁 Sélection ${stats.selectionsReussies + 1} - Cote actuelle: ${stats.coteTotal.toFixed(2)}x`);
    console.log(`🎯 Cote cible: ${config.coteTarget}x`);
    
    // Si on a déjà atteint la cote cible, arrêter
    if (stats.coteTotal >= config.coteTarget) {
      console.log(`🎉 Cote cible atteinte! ${stats.coteTotal.toFixed(2)}x >= ${config.coteTarget}x`);
      break;
    }
    
    // Traiter le match et sélectionner l'option
    const processResult = await processMatch(page, match, config);
    
    if (!processResult.success) {
      console.log(`❌ Échec de la sélection pour ce match, passage au suivant...`);
      stats.selectionsEchouees++;
      continue;
    }
    
    // Ajouter la sélection aux statistiques
    stats.selections.push({
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      option: processResult.option,
      cote: processResult.cote,
      timestamp: new Date().toISOString()
    });
    
    // Multiplier la cote totale
    stats.coteTotal *= processResult.cote;
    stats.selectionsReussies++;
    
    console.log(`✅ Sélection réussie: ${processResult.option} @${processResult.cote}`);
    console.log(`📈 Nouvelle cote totale: ${stats.coteTotal.toFixed(2)}x`);
    
    // Pause entre les sélections
    const pauseTime = Math.floor(Math.random() * 2000) + 1000; // 1-3 secondes
    console.log(`⏰ Pause de ${pauseTime/1000} secondes avant la prochaine sélection...`);
    await delay(pauseTime);
  }
  
  // Vérifier si on a des sélections
  if (stats.selectionsReussies === 0) {
    console.log(`❌ Aucune sélection réussie.`);
    return { success: false, parisPlaces: 0 };
  }
  
  // Afficher le résumé des sélections
  console.log(`\n📊 Résumé des sélections:`);
  console.log(`✅ Sélections réussies: ${stats.selectionsReussies}`);
  console.log(`❌ Sélections échouées: ${stats.selectionsEchouees}`);
  console.log(`🎯 Cote totale finale: ${stats.coteTotal.toFixed(2)}x`);
  console.log(`💰 Gain potentiel: ${(config.montantMise * stats.coteTotal).toFixed(2)}`);
  
  // Placer le pari si le placement automatique est activé
  if (config.placementAuto) {
    console.log(`\n💰 Placement automatique du pari combiné...`);
    const betResult = await placeBet(page, config.montantMise);
    
    if (betResult) {
      console.log(`🎉 Pari combiné placé avec succès!`);
      return { success: true, parisPlaces: 1 };
    } else {
      console.log(`❌ Échec du placement du pari combiné.`);
      return { success: false, parisPlaces: 0 };
    }
  } else {
    console.log(`\n❗ Placement manuel requis - Cote totale: ${stats.coteTotal.toFixed(2)}x`);
    return { success: true, parisPlaces: 1 };
  }
}

/**
 * Fonction principale qui exécute tout le processus
 */
async function main() {
  console.log(`\n🎮 BETPAWA BOT - SCRIPT INTÉGRÉ\n`);
  
  // Demander les paramètres à l'utilisateur
  const config = await demanderParametres();
  console.log("\n📝 Configuration:", config);
  
  // Initialiser le navigateur
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(60000);
  
  try {
    // Naviguer vers Betpawa
    console.log("\n🔎 Navigation vers Betpawa...");
    await page.goto('https://www.betpawa.cm', { waitUntil: 'networkidle2' });
    
    // Connexion automatique si demandée
    if (config.connexionAuto) {
      const loginSuccess = await connexionAutomatique(page);
      if (!loginSuccess) {
        throw new Error("Erreur lors de la connexion automatique.");
      }
    } else {
      console.log("\n⏰ Veuillez vous connecter manuellement...");
      await page.waitForFunction(() => {
        // Vérifier si l'utilisateur est connecté (présence du solde)
        return document.querySelector('.balance-amount') !== null;
      }, { timeout: 120000 }); // 2 minutes pour se connecter
      console.log("✅ Connexion manuelle détectée.");
    }
    
    // Cliquer sur "Tout voir Football"
    const footballButtonClicked = await clickToutVoirFootball(page);
    if (!footballButtonClicked) {
      throw new Error("Impossible de trouver le bouton 'Tout voir Football'.");
    }
    
    // Défilement pour charger tous les matchs
    await scrollToLoadAllMatches(page);
    
    // Extraire les données des matchs
    const matchData = await extractMatchData(page);
    
    if (matchData.length === 0) {
      throw new Error("Aucun match n'a été trouvé.");
    }
    
    // Sauvegarder les données des matchs dans un fichier
    const filename = `matchs-${new Date().toISOString().replace(/:/g, '-')}.json`;
    fs.writeFileSync(filename, JSON.stringify(matchData, null, 2));
    console.log(`💾 Données des matchs sauvegardées dans ${filename}`);
    
    // Exécuter le processus de paris
    const bettingResult = await executeBettingProcess(page, matchData, config);
    
    if (bettingResult.success) {
      console.log(`\n🎉 Processus terminé avec succès! ${bettingResult.parisPlaces} paris placés.`);
    } else {
      console.log(`\n⚠️ Processus terminé sans paris réussis.`);
    }
    
  } catch (error) {
    console.error(`\n❌ ERREUR: ${error.message}`);
  } finally {
    // Demander à l'utilisateur s'il veut fermer le navigateur
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const closeAnswer = await new Promise(resolve => {
      rl.question('\nFermer le navigateur? (o/n): ', answer => {
        rl.close();
        resolve(answer.toLowerCase());
      });
    });
    
    if (closeAnswer === 'o' || closeAnswer === 'oui') {
      await browser.close();
      console.log("\n🔒 Navigateur fermé. Au revoir!");
    } else {
      console.log("\n🔓 Navigateur laissé ouvert. Vous pouvez le fermer manuellement.");
    }
  }
}

// Exécuter la fonction principale
main().catch(error => {
  console.error(`\n❌ ERREUR FATALE: ${error.message}`);
  process.exit(1);
});
