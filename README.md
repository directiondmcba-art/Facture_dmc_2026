# DMC CRM

CRM privé pour les clients, factures, devis, paiements cash et sorties d’argent de DMC.

## Démarrage local

```bash
npm install
npm run dev
```

Sans variables Supabase, les données restent dans le navigateur. Pour activer le cloud en local, copiez `.env.example` en `.env.local`, puis renseignez l’URL et la publishable key du projet Supabase. Exécutez auparavant `supabase/schema.sql` dans le SQL Editor et créez un utilisateur dans Supabase Auth.

```bash
npm run build
npm run preview
```

## Fonctions

- Fiches clients mensuels ou ponctuels, avec suivi du contrat lorsque ses dates sont connues.
- Factures `FC001` et devis `DV001`, éditions, paiements manuels, relevés clients et impression PDF A4.
- Paiements en cash avec service, client facultatif et facture facultative. Un rattachement réduit automatiquement le reste à payer.
- Dépenses ponctuelles et primes par personne ; mode cash, banque ou autre.
- Charges mensuelles créées automatiquement jusqu’à leur arrêt, chaque mois avec état prévu ou payé.
- Sauvegarde JSON, restauration, synchronisation Supabase avec connexion e-mail/mot de passe et protection RLS.

Consultez [GUIDE_DEPLOIEMENT.md](GUIDE_DEPLOIEMENT.md) pour GitHub, Netlify, Supabase et la migration des données privées.

## Données 2026

Le code ne contient aucune donnée client. L’import de travail reste dans `private-data/`, ignoré par Git. Le navigateur local peut contenir une version plus récente : exportez toujours son JSON juste avant de migrer. Les quatre factures FC007/019/020/021 restent provisoires, faute de PDF ou de date. Les dates de début/fin de contrat mensuel seront complétées ultérieurement.
