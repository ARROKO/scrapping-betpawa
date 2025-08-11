require("dotenv").config();
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
  });

  const page = await browser.newPage();
  await page.goto("https://www.betpawa.cm/", { waitUntil: "networkidle2" });

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function improvedScroll() {
    console.log("Début du test de défilement amélioré...");
    
    // 1. Cliquer sur "Tout voir Football"
    try {
      await page.waitForSelector("div.event-counter span.pointer", { timeout: 10000 });
      await page.click("div.event-counter span.pointer");
      console.log('Clic sur "Tout voir Football" effectué.');
      await delay(3000);
    } catch (error) {
      console.log('Erreur sur le clic "Tout voir":', error.message);
      return;
    }

    // 2. Identifier le bon conteneur scrollable
    // Tester plusieurs sélecteurs possibles
    const possibleScrollContainers = [
      ".main-content-2",
      ".scrollable-content",
      ".section-middle",
      "body",
      "html"
    ];

    let workingContainer = null;

    // Test pour trouver quel conteneur peut défiler
    for (const selector of possibleScrollContainers) {
      try {
        const isScrollable = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (!element) return false;
          
          const hasScrollbar = element.scrollHeight > element.clientHeight;
          const isOverflowScroll = getComputedStyle(element).overflowY === 'scroll' || 
                                  getComputedStyle(element).overflowY === 'auto';
          
          console.log(`Conteneur ${sel}:`, {
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            hasScrollbar,
            isOverflowScroll,
            currentScrollTop: element.scrollTop
          });
          
          return hasScrollbar || isOverflowScroll;
        }, selector);

        if (isScrollable) {
          workingContainer = selector;
          console.log(`✅ Conteneur scrollable trouvé: ${selector}`);
          break;
        }
      } catch (error) {
        console.log(`❌ Erreur pour ${selector}:`, error.message);
      }
    }

    if (!workingContainer) {
      console.log("❌ Aucun conteneur scrollable trouvé, utilisation du scroll de la page");
      workingContainer = "body";
    }

    // 3. Fonction de défilement améliorée
    async function smoothScroll(container, totalSteps = 15) {
      console.log(`🚀 Début du défilement avec ${container}`);
      
      let initialMatchCount = 0;
      let currentMatchCount = 0;
      
      // Compter les matchs initiaux
      try {
        initialMatchCount = await page.$$eval('.game-events-container', els => els.length);
        console.log(`📊 Matchs initiaux: ${initialMatchCount}`);
      } catch (error) {
        console.log("Erreur comptage initial:", error.message);
      }

      for (let i = 0; i < totalSteps; i++) {
        try {
          // Méthode 1: ScrollTop
          await page.evaluate((sel, step) => {
            const element = sel === "body" ? document.body : document.querySelector(sel);
            if (element) {
              const increment = 800; // Plus grand increment
              element.scrollTop += increment;
              console.log(`📜 Défilement ${step + 1}: scrollTop = ${element.scrollTop}px`);
            }
          }, container, i);

          await delay(1000);

          // Méthode 2: ScrollBy (alternative)
          await page.evaluate((increment) => {
            window.scrollBy(0, increment);
          }, 800);

          await delay(1000);

          // Vérifier si de nouveaux matchs sont chargés
          try {
            currentMatchCount = await page.$$eval('.game-events-container', els => els.length);
            if (currentMatchCount > initialMatchCount) {
              console.log(`✨ Nouveaux matchs chargés! Total: ${currentMatchCount} (+${currentMatchCount - initialMatchCount})`);
              initialMatchCount = currentMatchCount;
            }
          } catch (error) {
            console.log("Erreur comptage matchs:", error.message);
          }

          // Vérifier la position de défilement
          const scrollInfo = await page.evaluate((sel) => {
            const element = sel === "body" ? document.body : document.querySelector(sel);
            return {
              scrollTop: element ? element.scrollTop : window.pageYOffset,
              scrollHeight: element ? element.scrollHeight : document.body.scrollHeight,
              clientHeight: element ? element.clientHeight : window.innerHeight
            };
          }, container);

          console.log(`📍 Position ${i+1}/${totalSteps}:`, scrollInfo);

          // Arrêter si on a atteint le bas
          if (scrollInfo.scrollTop + scrollInfo.clientHeight >= scrollInfo.scrollHeight - 100) {
            console.log("🏁 Bas de page atteint");
            break;
          }

        } catch (error) {
          console.error(`❌ Erreur étape ${i+1}:`, error.message);
        }
      }

      // Compte final des matchs
      try {
        const finalMatchCount = await page.$$eval('.game-events-container', els => els.length);
        console.log(`🎯 Défilement terminé. Matchs finaux: ${finalMatchCount}`);
      } catch (error) {
        console.log("Erreur comptage final:", error.message);
      }
    }

    // 4. Lancer le défilement
    await smoothScroll(workingContainer);

    // 5. Screenshot final
    await page.screenshot({ 
      path: 'final-scroll-result.png', 
      fullPage: true 
    });
    console.log("📸 Screenshot final sauvegardé");
  }

  // Alternative : Défilement par simulation de touches
  async function keyboardScroll() {
    console.log("🎹 Test avec défilement clavier...");
    
    // Cliquer sur la page pour focus
    await page.click('.main-content-2');
    await delay(1000);

    // Simuler Page Down plusieurs fois
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('PageDown');
      console.log(`⌨️ Page Down ${i + 1}/10`);
      await delay(2000);
      
      // Compter les matchs
      try {
        const matchCount = await page.$$eval('.game-events-container', els => els.length);
        console.log(`Matchs visibles: ${matchCount}`);
      } catch (error) {
        console.log("Erreur comptage:", error.message);
      }
    }
  }

  // Alternative : Défilement par wheel event
  async function wheelScroll() {
    console.log("🖱️ Test avec wheel event...");
    
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => {
        const event = new WheelEvent('wheel', {
          deltaY: 500,
          deltaMode: 0,
        });
        document.querySelector('.main-content-2')?.dispatchEvent(event) || 
        document.body.dispatchEvent(event);
      });
      
      console.log(`🔄 Wheel scroll ${i + 1}/20`);
      await delay(1000);
    }
  }

  // Exécuter les différentes méthodes
  try {
 
     console.log("=== Test 2: Défilement clavier ===");
     await keyboardScroll();
    
    
  } catch (error) {
    console.error("Erreur globale:", error);
  }

  await delay(5000);
  await browser.close();
})();