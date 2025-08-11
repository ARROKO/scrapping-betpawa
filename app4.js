require("dotenv").config();
const puppeteer = require("puppeteer");
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function demanderOption() {
  return new Promise((resolve) => {
    console.log("Choisissez une option :");
    console.log("1. Double chance");
    console.log("2. Juste victoire");
    console.log("3. Plus de 0.5 but");
    console.log("4. Double chance + victoire");
    console.log("5. Double chance + Plus de 0.5 but");
    console.log("6. Juste victoire + Plus de 0.5 but");
    rl.question("Votre choix (1/2/3) : ", (reponse) => {
      rl.close();
      resolve(reponse.trim());
    });
  });
}
(async () => {
  const choix = await demanderOption();

  // 1. Lancement du navigateur
  const browser = await puppeteer.launch({
    headless: false, // Mettez à true pour le mode sans interface
    slowMo: 50, // Ralentit les actions pour mieux voir ce qui se passe
  });

  const page = await browser.newPage();

  // 2. Aller sur la page d'accueil du site (remplacez l'URL)
  await page.goto("https://www.betpawa.cm/", {
    waitUntil: "networkidle2",
  });

  // 3. Cliquer sur le bouton Connexion
 // await page.waitForSelector('a.button.button-accent[href="/login"]');
  //await page.click('a.button.button-accent[href="/login"]');

  // 4. Attendre que le popup de connexion apparaisse et remplir les infos
  // Vous devrez adapter ces sélecteurs selon le HTML réel du popup
  //await page.waitForSelector(".country-code"); // Sélecteur du champ code pays
  //await page.type(".country-code", process.env.COUNTRY_CODE);

  // await page.waitForSelector("#login-form-phoneNumber"); // Sélecteur du champ email
  // await page.type("#login-form-phoneNumber", process.env.PHONE_NUMBER);

  // await page.waitForSelector("#login-form-password-input"); // Sélecteur du champ mot de passe
  // await page.type("#login-form-password-input", process.env.PASSWORD);

  // 5. Soumettre le formulaire
  // await page.click('input[data-test-id="logInButton"]'); // Sélecteur du bouton de soumission (input submit)

  // Attendre la connexion (vous pouvez vérifier un élément qui n'apparaît qu'après connexion)
  // await page.waitForSelector(".balance", { timeout: 5000 });

  // console.log("Connexion réussie!");

  // Récupérer et afficher le contenu de l'élément .count
  // Attendre et récupérer le texte du span
  // const solde = await page.$eval("span.button.balance", (span) =>
  //   span.textContent.trim()
  // );
  // console.log("Solde:", solde);

  // Extraire uniquement la partie numérique du solde
  // const match = solde.match(/[\d,.]+/);
  // const soldeNum = match ? parseFloat(match[0].replace(",", ".")) : 0;

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
    await delay(4000); // Longue attente après défilement
  }
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function safeClickAndPlaceBet(targetOdds = 5000, stakeAmount = 100) {
    const MAX_ODDS = 2;
    let selectedMatches = 0;
    let consecutiveNoMatches = 0;
    const MAX_CONSECUTIVE_NO_MATCHES = 10;
    let currentTotal = 1;
    const selectedOdds = []; // Nous allons stocker les cotes sélectionnées ici

    // Phase 1: Sélection des paris
    while (true) {
      let foundValidMatch = false;
      
      console.log("🔢 Total calculé:", currentTotal.toFixed(2));
        
      try {
        // Vérifier si l'objectif est atteint
        if (currentTotal >= targetOdds) {
          console.log("🎯 Objectif atteint !");
          break;
        }

        // Trouver et traiter les matchs
        await page.waitForSelector(".event-bets", { timeout: 10000 });
        const bets = await page.$$(".event-bets");

        for (const bet of bets) {
          try {
            const isSelected = await bet
              .evaluate((el) => !!el.querySelector(".event-bet.selected"))
              .catch(() => false);

            if (isSelected) continue;

            const odds = await bet.$$eval(
              ".event-odds span:not(.svg-icon)",
              (els) => els.map((el) => parseFloat(el.textContent.replace(",", ".")) || Infinity)
            );

            if (odds.length < 3 || Math.min(odds[0], odds[2]) > MAX_ODDS)
              continue;

            const bestOdd = Math.min(odds[0], odds[2]);
            const selector =
              odds[0] < odds[2]
                ? '[data-test-id*="3744"] .event-bet'
                : '[data-test-id*="3746"] .event-bet';

            const btn = await bet.$(selector);
            if (btn) {
              await btn.click();
              await delay(2000);

              const isNowSelected = await btn.evaluate((el) =>
                el.classList.contains("selected")
              );

              if (isNowSelected) {
                selectedOdds.push(bestOdd); // Ajouter la cote à notre liste
                currentTotal = selectedOdds.reduce((total, odd) => total * odd, 1); // Calculer le nouveau total
                selectedMatches++;
                foundValidMatch = true;
                consecutiveNoMatches = 0;
                console.log(
                  `✅ Paris ${selectedMatches}: Côte ${bestOdd.toFixed(2)} | Total: ${currentTotal.toFixed(2)}`
                );
                
                // Vérifier à nouveau l'objectif après chaque sélection
                if (currentTotal >= targetOdds) break;
              }
            }
          } catch (error) {
            console.error("⚠️ Erreur sur un match:", error.message);
          }
        }

        if (!foundValidMatch) {
          consecutiveNoMatches++;
          console.log(
            `🔄 Défilement ${consecutiveNoMatches} (aucun nouveau match valide)`
          );

          if (consecutiveNoMatches >= MAX_CONSECUTIVE_NO_MATCHES) {
            console.log("🏁 Aucun nouveau match depuis longtemps");
            break;
          }
        } else {
          consecutiveNoMatches = 0;
        }

        await autoScroll(page);
      } catch (error) {
        console.error("🚨 Erreur générale:", error.message);
        await delay(5000);
      }
    }

    // Vérification finale avec le vrai total du site (optionnel)
    let finalTotal = currentTotal;
    try {
      const siteTotal = await page.$eval(
        '[data-test-id="totalOdds"]',
        (el) => parseFloat(el.textContent.replace(/[^\d,]/g, '').replace(",", ".")) || 1
      );
      console.log(`🔍 Total affiché sur le site: ${siteTotal.toFixed(2)}`);
      finalTotal = Math.max(currentTotal, siteTotal); // Prendre le plus grand des deux
    } catch (error) {
      console.log("ℹ️ Impossible de vérifier le total sur le site");
    }

    return {
      success: finalTotal >= targetOdds,
      totalOdds: finalTotal,
      selectedMatches,
      betPlaced: selectedMatches > 0,
    };
}

  // if (soldeNum > 0) {
    // console.log("Le solde est supérieur à 0:", soldeNum);

    // Après la connexion et la récupération du solde

    // Vérifier si l'élément "Tout voir Football" existe et cliquer dessus si présent
    const toutVoirSelector = "div.event-counter span.pointer span:first-child";

    const toutVoirExists = await page.$(toutVoirSelector);
    if (toutVoirExists) {
      // Cliquer sur le parent .pointer pour s'assurer que le clic fonctionne
      await page.click("div.event-counter span.pointer");
      console.log('Clic sur "Tout voir Football" effectué.');
      console.log("Vous avez choisit", choix);

      // Utilise la variable "choix" pour la suite du script
      if (choix === "1") {
        console.log("Option choisie : Double chance");
        // ... logique double chance ...
      } else if (choix === "2") {
        console.log("Option choisie : Juste victoire");

        // Utilisation
        (async () => {
          const result = await safeClickAndPlaceBet(1000000, 10);
          console.log(result);
        })();

      } else if (choix === "3") {
        console.log("Option choisie : Double chance + victoire");
        // ... logique combinée ...
      } else {
        console.log("Choix invalide, arrêt du script.");
        process.exit(1);
      }
    } else {
      console.log('"Tout voir Football" non trouvé.');
    }
  // } else {
  //   console.log("Le solde est nul ou négatif:", soldeNum);
  //   // ... arrêter ou autre action ...
  // }

  // Fermer le navigateur
  //await browser.close();
})();
