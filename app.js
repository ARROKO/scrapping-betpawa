require('dotenv').config();
const puppeteer = require('puppeteer');

(async () => {
  // 1. Lancement du navigateur
  const browser = await puppeteer.launch({
    headless: false, // Mettez à true pour le mode sans interface
    slowMo: 50, // Ralentit les actions pour mieux voir ce qui se passe
  });
  
  const page = await browser.newPage();
  
  // 2. Aller sur la page d'accueil du site (remplacez l'URL)
  await page.goto('https://www.betpawa.cm/', { 
    waitUntil: 'networkidle2' 
  });

  // 3. Cliquer sur le bouton Connexion
  await page.waitForSelector('a.button.button-accent[href="/login"]');
  await page.click('a.button.button-accent[href="/login"]');

  // 4. Attendre que le popup de connexion apparaisse et remplir les infos
  // Vous devrez adapter ces sélecteurs selon le HTML réel du popup
  await page.waitForSelector('.country-code'); // Sélecteur du champ code pays
  await page.type('.country-code', process.env.COUNTRY_CODE);
  
  await page.waitForSelector('#login-form-phoneNumber'); // Sélecteur du champ email
  await page.type('#login-form-phoneNumber', process.env.PHONE_NUMBER);
  
  await page.waitForSelector('#login-form-password-input'); // Sélecteur du champ mot de passe
  await page.type('#login-form-password-input', process.env.PASSWORD);
  
  // 5. Soumettre le formulaire
await page.click('input[data-test-id="logInButton"]'); // Sélecteur du bouton de soumission (input submit)

  // Attendre la connexion (vous pouvez vérifier un élément qui n'apparaît qu'après connexion)
  await page.waitForSelector('.balance', { timeout: 5000 });

  console.log('Connexion réussie!');

  // Récupérer et afficher le contenu de l'élément .count
  // Attendre et récupérer le texte du span
    const solde = await page.$eval('span.button.balance', span => span.textContent.trim());
console.log('Solde:', solde);

// Extraire uniquement la partie numérique du solde
const match = solde.match(/[\d,.]+/);
const soldeNum = match ? parseFloat(match[0].replace(',', '.')) : 0;

if (soldeNum > 0) {
  console.log('Le solde est supérieur à 0:', soldeNum);
  // ... continuer le script ...
} else {
  console.log('Le solde est nul ou négatif:', soldeNum);
  // ... arrêter ou autre action ...
}

  // Fermer le navigateur
   await browser.close();
})();