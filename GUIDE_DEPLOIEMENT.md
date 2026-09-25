# Mise en ligne du CRM DMC

Le ZIP `DMC-CRM-GitHub.zip` contient uniquement le code. Il ne contient ni données clients, ni factures 2026, ni logo, ni cachet, ni mot de passe. Gardez la sauvegarde JSON à part.

## 1. Sauvegarder les données présentes sur ce PC

Dans le CRM local (`http://localhost:4173/`), cliquez sur **Exporter une sauvegarde**. Conservez le fichier JSON dans un emplacement privé. Faites cette opération juste avant la migration : la sauvegarde contient les dernières modifications du navigateur, les factures 2026, le logo et le cachet. Le fichier `private-data/dmc-2026-import.json` est une copie de travail antérieure et peut être moins à jour.

## 2. Préparer Supabase

1. Créez un projet sur [Supabase](https://supabase.com/dashboard). Choisissez un mot de passe fort pour le projet et gardez-le hors de GitHub.
2. Dans **SQL Editor**, créez une requête, collez le contenu de `supabase/schema.sql`, puis exécutez-la une fois. La table `crm_state` stocke les données ; ses règles RLS limitent chaque utilisateur à sa propre ligne.
3. Dans **Authentication > Users**, créez votre utilisateur avec son adresse e-mail et un mot de passe. Le CRM utilise la connexion e-mail/mot de passe. Utilisez le **même compte** sur les différents PC pour retrouver le même espace CRM.
4. Dans **Project Settings / API Keys** (le nom du menu peut varier), copiez l’URL du projet et la **publishable key**. Ne copiez jamais la clé `service_role` ni une clé secrète dans le site.

## 3. Mettre le code sur GitHub

1. Créez un dépôt GitHub, idéalement privé.
2. Décompressez `DMC-CRM-GitHub.zip` sur votre PC.
3. Sur GitHub, choisissez **Add file > Upload files**, puis déposez le contenu décompressé à la racine du dépôt : `package.json`, `src/`, `supabase/`, `netlify.toml`, etc.
4. Vérifiez que le dépôt **ne contient pas** le JSON de sauvegarde, `.env`, `private-data/`, `node_modules/` ou `dist/`.

Vous pouvez aussi publier par Git en ligne de commande depuis le dossier décompressé :

```bash
git init
git add .
git commit -m "CRM DMC initial"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
git push -u origin main
```

## 4. Déployer sur Netlify

1. Connectez-vous à [Netlify](https://app.netlify.com/) et choisissez **Add new project > Import an existing project > GitHub**.
2. Sélectionnez le dépôt. Le fichier `netlify.toml` prévoit déjà la commande `npm run build` et le dossier publié `dist`. Le fichier `.nvmrc` demande Node.js 24.
3. Avant de déployer, ajoutez dans **Environment variables** ces deux variables de construction :

   - `VITE_SUPABASE_URL` = l’URL du projet Supabase.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = la publishable key Supabase.

4. Lancez le déploiement. Si les variables sont ajoutées après un premier déploiement, relancez un build/deploy pour qu’elles soient prises en compte.

## 5. Transférer les données et utiliser plusieurs PC

1. Ouvrez l’URL Netlify. Connectez-vous avec l’utilisateur créé dans Supabase.
2. Au premier démarrage, choisissez **Commencer avec un espace vide** si le site Netlify ne propose pas « Importer les données de cet appareil ». Le stockage local de `localhost` et celui du site Netlify sont séparés.
3. Dans le CRM Netlify, choisissez **Restaurer une sauvegarde** et sélectionnez le JSON exporté à l’étape 1. Attendez l’indication **Synchronisé avec Supabase** dans la barre latérale.
4. Ouvrez la même URL Netlify sur un autre PC et connectez-vous avec le **même utilisateur Supabase**. Les données sont chargées depuis Supabase. Cliquez sur **Actualiser le cloud** pour voir les modifications d’un autre PC sans quitter la page.

L’enregistrement cloud est automatique après une modification. Si deux PC modifient l’espace en parallèle, le CRM bloque l’écrasement de la version distante et affiche un message : exportez alors une sauvegarde JSON du PC concerné avant de recharger. Évitez de modifier la même fiche en même temps sur deux PC.

## 6. Exporter une facture en PDF

Créez la facture, renseignez sa référence `FC` suivie de trois chiffres, puis cliquez sur l’icône d’impression de sa ligne. Dans l’aperçu, cliquez sur **Imprimer / PDF** et choisissez **Enregistrer au format PDF** dans la fenêtre d’impression du navigateur. Les devis (`DV` + trois chiffres) et les relevés clients se téléchargent de la même manière.

Pour les factures historiques, le bouton **PDF ↗** ouvre le PDF d’origine dans Drive. Les entrées provisoires sans PDF ne sont pas des documents prêts à envoyer au client.

## Vérification rapide après migration

Le site doit afficher les clients et factures 2026 restaurés, ainsi que le logo/cachet si le JSON exporté les contenait. Créez un paiement cash d’essai, rechargez la page et vérifiez qu’il persiste. Supprimez ensuite l’essai. Pour une facture nouvelle, vérifiez un PDF à une page et un PDF à plusieurs pages avant le premier envoi réel.
