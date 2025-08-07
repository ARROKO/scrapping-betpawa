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

  // Extraire uniquement la partie numérique du solde

  if (true) {
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
        // Fonction pour comparer et cliquer sur la meilleure cote

        // Version optimisée avec gestion des erreurs

        // async function safeClickUntilTargetOdds(targetOdds = 5000) {
        //   const MAX_ODDS = 1.5;
        //   let selectedMatches = 0;
        //   let idleScrolls = 0;
        //   const MAX_IDLE_SCROLLS = 5;

        //   const delay = (ms) =>
        //     new Promise((resolve) => setTimeout(resolve, ms));

        //   while (true) {
        //     let foundValidMatch = false;

        //     try {
        //       await page.waitForSelector(".event-bets", { timeout: 10000 });
        //       const bets = await page.$$(".event-bets");

        //       for (const bet of bets) {
        //         try {
        //           // Vérifier si déjà sélectionné
        //           const isSelected = await bet
        //             .evaluate((el) => {
        //               return !!el.querySelector(".event-bet.selected");
        //             })
        //             .catch(() => false);

        //           if (isSelected) continue;

        //           const odds = await bet.$$eval(
        //             ".event-odds span:not(.svg-icon)",
        //             (els) =>
        //               els.map((el) => parseFloat(el.textContent) || Infinity)
        //           );

        //           if (odds.length < 3 || Math.min(odds[0], odds[2]) > MAX_ODDS)
        //             continue;

        //           const bestOdd = Math.min(odds[0], odds[2]);
        //           const selector =
        //             odds[0] < odds[2]
        //               ? '[data-test-id*="3744"] .event-bet'
        //               : '[data-test-id*="3746"] .event-bet';

        //           // Cliquer sur l'élément parent qui reçoit la classe selected
        //           await bet.$(selector).then(async (btn) => {
        //             if (btn) {
        //               await btn.click();
        //               await delay(1500); // Attendre l'animation

        //               // Vérifier la classe selected sur le bon élément
        //               const isNowSelected = await btn.evaluate((el) =>
        //                 el.classList.contains("selected")
        //               );

        //               if (isNowSelected) {
        //                 selectedMatches++;
        //                 foundValidMatch = true;
        //                 console.log(
        //                   `✅ Paris ${selectedMatches}: Côte ${bestOdd.toFixed(
        //                     2
        //                   )}`
        //                 );

        //                 // Vérifier le total après chaque sélection valide
        //                 try {
        //                   const currentTotal = await page.$eval(
        //                     '[data-test-id="totalOdds"]',
        //                     (el) =>
        //                       parseFloat(el.textContent.replace(",", ".")) || 1
        //                   );
        //                   console.log(
        //                     `📊 Total actuel: ${currentTotal.toFixed(2)}`
        //                   );

        //                   if (currentTotal >= targetOdds) {
        //                     console.log(
        //                       `🎉 Objectif atteint: ${currentTotal.toFixed(2)}`
        //                     );
        //                     return {
        //                       success: true,
        //                       totalOdds: currentTotal,
        //                       selectedMatches,
        //                     };
        //                   }
        //                 } catch (error) {
        //                   console.log("ℹ️ TotalOdds non disponible");
        //                 }
        //               } else {
        //                 console.log("❌ La sélection n'a pas été activée");
        //               }
        //             }
        //           });
        //         } catch (error) {
        //           console.error("⚠️ Erreur sur un match:", error.message);
        //         }
        //       }

        //       if (!foundValidMatch) {
        //         idleScrolls++;
        //         console.log(`🔄 Défilement ${idleScrolls}/${MAX_IDLE_SCROLLS}`);

        //         if (idleScrolls >= MAX_IDLE_SCROLLS) {
        //           const finalTotal = await page
        //             .$eval(
        //               '[data-test-id="totalOdds"]',
        //               (el) => parseFloat(el.textContent) || 1
        //             )
        //             .catch(() => 1);

        //           console.log(
        //             `🏁 Fin des matchs - Total final: ${finalTotal.toFixed(2)}`
        //           );
        //           return {
        //             success: false,
        //             totalOdds: finalTotal,
        //             selectedMatches,
        //           };
        //         }
        //       } else {
        //         idleScrolls = 0;
        //       }

        //       await page.evaluate(() =>
        //         window.scrollBy(0, window.innerHeight * 2)
        //       );
        //       await delay(3000);
        //     } catch (error) {
        //       console.error("🚨 Erreur générale:", error.message);
        //       await delay(5000);
        //     }
        //   }
        // }

        async function safeClickUntilTargetOdds(targetOdds = 5000) {
          const MAX_ODDS = 1.5;
          let selectedMatches = 0;
          let consecutiveNoMatches = 0;
          const MAX_CONSECUTIVE_NO_MATCHES = 10; // Augmenté pour plus de tolérance

          const delay = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));

          while (true) {
            let foundValidMatch = false;
            let currentTotal = 1;

            try {
              // 1. Vérifier le total actuel
              try {
                currentTotal = await page.$eval(
                  '[data-test-id="totalOdds"]',
                  (el) => parseFloat(el.textContent.replace(",", ".")) || 1
                );
                console.log(
                  `📊 Total actuel: ${currentTotal.toFixed(2)}/${targetOdds}`
                );

                if (currentTotal >= targetOdds) {
                  console.log(`🎉 Objectif atteint!`);
                  return {
                    success: true,
                    totalOdds: currentTotal,
                    selectedMatches,
                  };
                }
              } catch (error) {
                console.log("ℹ️ TotalOdds non disponible");
              }

              // 2. Trouver et traiter les matchs
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
                    (els) =>
                      els.map((el) => {
                        const text = el.textContent.trim();
                        return text ? parseFloat(text) : Infinity;
                      })
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
                    await delay(2000); // Attente plus longue pour la sélection

                    const isNowSelected = await btn.evaluate((el) =>
                      el.classList.contains("selected")
                    );

                    if (isNowSelected) {
                      selectedMatches++;
                      foundValidMatch = true;
                      consecutiveNoMatches = 0; // Reset le compteur
                      console.log(
                        `✅ Paris ${selectedMatches}: Côte ${bestOdd.toFixed(
                          2
                        )}`
                      );
                    }
                  }
                } catch (error) {
                  console.error("⚠️ Erreur sur un match:", error.message);
                }
              }

              // 3. Gestion du défilement
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

              // 4. Faire défiler intelligemment
              await autoScroll(page);
            } catch (error) {
              console.error("🚨 Erreur générale:", error.message);
              await delay(5000);
            }
          }

          // Vérification finale du total
          const finalTotal = await page
            .$eval(
              '[data-test-id="totalOdds"]',
              (el) => parseFloat(el.textContent.replace(",", ".")) || 1
            )
            .catch(() => 1);

          console.log(`🏁 Résultat final: ${finalTotal.toFixed(2)}`);
          return {
            success: finalTotal >= targetOdds,
            totalOdds: finalTotal,
            selectedMatches,
          };
        }

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

        // Exemple d'utilisation
        (async () => {
          try {
            const result = await safeClickUntilTargetOdds(100);
            console.log(result);
          } catch (error) {
            console.error("💥 Erreur fatale:", error);
          }
        })();

        // Attendre que la div .game-category soit présente
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
  } else {
    console.log("Le solde est nul ou négatif:", soldeNum);
    // ... arrêter ou autre action ...
  }

  // Fermer le navigateur
  //await browser.close();
})();
