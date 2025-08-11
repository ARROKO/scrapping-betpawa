const puppeteer = require("puppeteer");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Fonction pour demander une option à l'utilisateur
function demanderOption() {
  return new Promise((resolve) => {
    console.log("\n=== CHOISISSEZ VOTRE STRATÉGIE DE PARIS ===");
    console.log("1. Double chance (1X ou X2)");
    console.log("2. Juste victoire (1 ou 2)");
    console.log("3. Plus de 0.5 but (côte la plus faible)");
    console.log("4. Double chance + victoire");
    console.log("5. Double chance + Plus de 0.5 but");
    console.log("6. Juste victoire + Plus de 0.5 but");
    
    rl.question("Votre choix (1-6) : ", (reponse) => {
      resolve(reponse.trim());
    });
  });
}

// Fonction pour demander les paramètres
function demanderParametres() {
  return new Promise((resolve) => {
    console.log("\n=== CONFIGURATION DES PARAMÈTRES ===");
    rl.question("Côte maximale par match (ex: 1.5) : ", (coteMax) => {
      rl.question("Côte totale à atteindre (ex: 100) : ", (coteTotal) => {
        rl.close();
        resolve({
          coteMax: parseFloat(coteMax) || 1.5,
          coteTotal: parseFloat(coteTotal) || 100
        });
      });
    });
  });
}

(async () => {
  try {
    // Configuration utilisateur
    const choix = await demanderOption();
    const { coteMax, coteTotal } = await demanderParametres();
    
    console.log(`\n✅ Configuration choisie :`);
    console.log(`- Stratégie : ${choix}`);
    console.log(`- Côte max par match : ${coteMax}`);
    console.log(`- Côte totale visée : ${coteTotal}`);

    // Lancement du navigateur
    console.log(`\n🚀 Lancement du navigateur...\n`);
    const browser = await puppeteer.launch({
      headless: false,
      slowMo: 100,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Fonction utilitaire pour les délais
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Aller directement sur BetPawa
    console.log("🌐 Navigation vers BetPawa...");
    await page.goto("https://www.betpawa.cm/", {
      waitUntil: "networkidle2",
    });
    await delay(3000);

    // Cliquer sur "Tout voir Football"
    console.log("⚽ Recherche des matchs de football...");
    try {
      await page.waitForSelector("div.event-counter span.pointer", { timeout: 10000 });
      await page.click("div.event-counter span.pointer");
      console.log("✅ Clic sur 'Tout voir Football' effectué");
      await delay(5000); // Attendre que les matchs se chargent
    } catch (error) {
      console.log("❌ Erreur: 'Tout voir Football' non trouvé", error.message);
      await browser.close();
      return;
    }

    // Fonction de défilement améliorée
    async function autoScroll() {
      console.log("📜 Défilement automatique...");
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let scrollPosition = 0;
          const maxScroll = 3000; // Augmenté pour voir plus de matchs
          const scrollInterval = setInterval(() => {
            window.scrollBy(0, 600);
            scrollPosition += 600;
            if (scrollPosition >= maxScroll) {
              clearInterval(scrollInterval);
              resolve();
            }
          }, 300);
        });
      });
      await delay(3000);
    }

    // Fonction de sélection intelligente des paris
    async function selectionnerParis() {
      console.log("🎯 Début de la sélection des paris...\n");
      
      const MAX_TENTATIVES = 15;
      let totalCotes = 1;
      let parisSelectionnes = 0;
      let tentativesSansNouveau = 0;

      for (let tentative = 0; tentative < MAX_TENTATIVES; tentative++) {
        console.log(`--- Tentative ${tentative + 1}/${MAX_TENTATIVES} ---`);
        
        let nouvelleSelection = false;

        try {
          // Attendre que les matchs soient présents
          await page.waitForSelector(".event-bets", { timeout: 8000 });
          const matchsDisponibles = await page.$$(".event-bets");
          console.log(`👀 ${matchsDisponibles.length} matchs analysés`);

          for (const match of matchsDisponibles) {
            try {
              // Vérifier si déjà sélectionné
              const dejaSelectionne = await match.evaluate(el => 
                !!el.querySelector(".event-bet.selected")
              ).catch(() => false);
              
              if (dejaSelectionne) continue;

              // Extraire les côtes du match
              const cotes = await match.$$eval(
                ".event-odds span:not(.svg-icon)",
                (elements) => elements.map(el => {
                  const texte = el.textContent.trim();
                  return parseFloat(texte) || Infinity;
                })
              ).catch(() => []);

              if (cotes.length < 3) continue;

              const [cote1, coteX, cote2] = cotes;
              let selecteurCible = null;
              let coteChoisie = null;

              // Logique de sélection selon la stratégie choisie
              switch (choix) {
                case '1': // Double chance
                  if (cote1 <= coteMax && coteX <= coteMax) {
                    const meilleureOption = cote1 < coteX ? 
                      { selector: '[data-test-id*="3744"] .event-bet', cote: cote1, nom: "1" } :
                      { selector: '[data-test-id*="3745"] .event-bet', cote: coteX, nom: "X" };
                    selecteurCible = meilleureOption.selector;
                    coteChoisie = meilleureOption.cote;
                  } else if (coteX <= coteMax && cote2 <= coteMax) {
                    const meilleureOption = coteX < cote2 ? 
                      { selector: '[data-test-id*="3745"] .event-bet', cote: coteX, nom: "X" } :
                      { selector: '[data-test-id*="3746"] .event-bet', cote: cote2, nom: "2" };
                    selecteurCible = meilleureOption.selector;
                    coteChoisie = meilleureOption.cote;
                  }
                  break;

                case '2': // Juste victoire
                  if (cote1 <= coteMax && cote2 <= coteMax) {
                    const meilleureOption = cote1 < cote2 ? 
                      { selector: '[data-test-id*="3744"] .event-bet', cote: cote1, nom: "1" } :
                      { selector: '[data-test-id*="3746"] .event-bet', cote: cote2, nom: "2" };
                    selecteurCible = meilleureOption.selector;
                    coteChoisie = meilleureOption.cote;
                  }
                  break;

                case '3': // Plus de 0.5 but (côte la plus faible)
                  const coteLaPlusFaible = Math.min(cote1, coteX, cote2);
                  if (coteLaPlusFaible <= coteMax) {
                    if (coteLaPlusFaible === cote1) {
                      selecteurCible = '[data-test-id*="3744"] .event-bet';
                      coteChoisie = cote1;
                    } else if (coteLaPlusFaible === coteX) {
                      selecteurCible = '[data-test-id*="3745"] .event-bet';
                      coteChoisie = coteX;
                    } else {
                      selecteurCible = '[data-test-id*="3746"] .event-bet';
                      coteChoisie = cote2;
                    }
                  }
                  break;

                // Pour les stratégies combinées, on peut utiliser la logique simple pour le test
                default:
                  console.log(`⚠️ Stratégie ${choix} non implémentée, utilisation de la victoire simple`);
                  if (cote1 <= coteMax && cote2 <= coteMax) {
                    const meilleureOption = cote1 < cote2 ? 
                      { selector: '[data-test-id*="3744"] .event-bet', cote: cote1 } :
                      { selector: '[data-test-id*="3746"] .event-bet', cote: cote2 };
                    selecteurCible = meilleureOption.selector;
                    coteChoisie = meilleureOption.cote;
                  }
              }

              // Vérifier si cette sélection ne dépasse pas l'objectif
              const nouvelleCoteTotal = totalCotes * coteChoisie;
              if (selecteurCible && coteChoisie && nouvelleCoteTotal <= (coteTotal * 1.1)) {
                try {
                  const bouton = await match.$(selecteurCible);
                  if (bouton) {
                    // Faire défiler vers l'élément si nécessaire
                    await bouton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(500);
                    
                    await bouton.click();
                    await delay(2000);

                    // Vérifier si le clic a fonctionné
                    const maintenantSelectionne = await bouton.evaluate(el =>
                      el.classList.contains('selected')
                    );

                    if (maintenantSelectionne) {
                      totalCotes = nouvelleCoteTotal;
                      parisSelectionnes++;
                      nouvelleSelection = true;
                      tentativesSansNouveau = 0;
                      
                      console.log(`✅ Paris ${parisSelectionnes}: Côte ${coteChoisie.toFixed(2)} | Total: ${totalCotes.toFixed(2)}`);
                      
                      // Vérifier si objectif atteint
                      if (totalCotes >= coteTotal) {
                        console.log(`🎯 OBJECTIF ATTEINT ! Côte totale: ${totalCotes.toFixed(2)}`);
                        return { totalCotes, parisSelectionnes, success: true };
                      }
                    } else {
                      console.log(`⚠️ Clic échoué sur le match`);
                    }
                  }
                } catch (clicErreur) {
                  console.log("⚠️ Erreur lors du clic:", clicErreur.message);
                }
              }
            } catch (erreurMatch) {
              // Erreur silencieuse pour éviter trop de logs
              console.log("⚠️ Erreur analyse match:", erreurMatch.message);
            }
          }

          if (!nouvelleSelection) {
            tentativesSansNouveau++;
            console.log(`🔄 Aucune nouvelle sélection (${tentativesSansNouveau}/3)`);
            
            if (tentativesSansNouveau >= 3) {
              console.log("⏹️ Arrêt: Trop de tentatives sans sélection");
              break;
            }
            
            // Défiler pour voir plus de matchs
            await autoScroll();
          } else {
            tentativesSansNouveau = 0;
          }

        } catch (erreur) {
          console.error("🚨 Erreur générale:", erreur.message);
          await delay(3000);
        }

        // Petite pause entre les tentatives
        await delay(1000);
      }

      return { 
        totalCotes, 
        parisSelectionnes, 
        success: totalCotes >= (coteTotal * 0.9) 
      };
    }

    // Exécution de la sélection
    const resultat = await selectionnerParis();

    // Affichage du résumé final
    console.log("\n" + "=".repeat(50));
    console.log("📊 RÉSUMÉ FINAL DU TEST");
    console.log("=".repeat(50));
    console.log(`🎯 Stratégie utilisée: ${choix}`);
    console.log(`📈 Matchs sélectionnés: ${resultat.parisSelectionnes}`);
    console.log(`💰 Côte totale atteinte: ${resultat.totalCotes.toFixed(2)}`);
    console.log(`🎪 Objectif (${coteTotal}): ${resultat.success ? '✅ ATTEINT' : '❌ Non atteint'}`);
    
    if (resultat.success) {
      console.log("🎉 Excellent ! Votre stratégie fonctionne bien !");
    } else {
      console.log("💡 Conseil: Essayez d'ajuster les paramètres (côte max ou objectif)");
    }

    console.log("\n⏳ Test terminé. Le navigateur reste ouvert pour inspection...");
    console.log("Fermez manuellement le navigateur quand vous avez fini.");

    // Optionnel: fermeture automatique après un délai
    // setTimeout(() => browser.close(), 30000);

  } catch (erreur) {
    console.error("💥 Erreur fatale:", erreur.message);
  }
})();