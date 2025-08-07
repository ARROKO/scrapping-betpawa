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
  await page.waitForSelector('a.button.button-accent[href="/login"]');
  await page.click('a.button.button-accent[href="/login"]');

  // 4. Attendre que le popup de connexion apparaisse et remplir les infos
  // Vous devrez adapter ces sélecteurs selon le HTML réel du popup
  await page.waitForSelector(".country-code"); // Sélecteur du champ code pays
  await page.type(".country-code", process.env.COUNTRY_CODE);

  await page.waitForSelector("#login-form-phoneNumber"); // Sélecteur du champ email
  await page.type("#login-form-phoneNumber", process.env.PHONE_NUMBER);

  await page.waitForSelector("#login-form-password-input"); // Sélecteur du champ mot de passe
  await page.type("#login-form-password-input", process.env.PASSWORD);

  // 5. Soumettre le formulaire
  await page.click('input[data-test-id="logInButton"]'); // Sélecteur du bouton de soumission (input submit)

  // Attendre la connexion (vous pouvez vérifier un élément qui n'apparaît qu'après connexion)
  await page.waitForSelector(".balance", { timeout: 5000 });

  console.log("Connexion réussie!");

  // Récupérer et afficher le contenu de l'élément .count
  // Attendre et récupérer le texte du span
  const solde = await page.$eval("span.button.balance", (span) =>
    span.textContent.trim()
  );
  console.log("Solde:", solde);

  // Extraire uniquement la partie numérique du solde
  const match = solde.match(/[\d,.]+/);
  const soldeNum = match ? parseFloat(match[0].replace(",", ".")) : 0;

  if (soldeNum > 0) {
    console.log("Le solde est supérieur à 0:", soldeNum);

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
  // await browser.close();
})();
