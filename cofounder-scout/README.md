# Cofounder Scout

Bot quotidien qui cherche un·e cofondateur·rice / premier·e employé·e pour une école business + IA (esprit Albert School, vibe plus business), et envoie chaque matin par email une shortlist de 4-5 profils avec score, justification et accroche d'approche.

Il tourne 2 mois (date de fin configurable), ne propose jamais deux fois la même personne, et creuse chaque jour des requêtes différentes.

Règles de ciblage actuelles :
- Paris uniquement.
- Un seul classement, mais chaque profil est étiqueté **Cofondateur·rice** / **Premier·e employé·e** / les deux.
- Profils **business** et **tech** acceptés, étiquetés comme tels (un ingénieur IA français qui enseigne est un profil recherché).
- Les personnes encore en poste chez Le Wagon, Albert School, etc. sont incluses, pas seulement les anciens.

## Comment ça marche

```
recettes de recherche (rotation quotidienne)
        │
        ├─ Apollo.io People Search  ──┐
        └─ Google Programmable Search ─┤  (profils LinkedIn publics indexés par Google)
                                       ▼
                        dédoublonnage + mémoire (data/state.json)
                                       ▼
                        pré-filtre par mots-clés (gratuit)
                                       ▼
                        scoring Claude (rubrique ICP, sortie JSON structurée)
                                       ▼
                        classement + shortlist top 5
                                       ▼
                        email HTML (Gmail SMTP)
```

Pas de scraping de LinkedIn en direct : c'est contraire aux CGU et ça fait bannir le compte. Les deux sources utilisées sont des API légitimes. Le bot ne collecte ni email ni téléphone : la prise de contact se fait via le lien LinkedIn fourni.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/icp.ts` | **Le profil cible et les recettes de recherche.** C'est le fichier à éditer pour ajuster la cible. |
| `src/sources/apollo.ts` | Source Apollo.io (People Search, ne consomme pas de crédits d'enrichissement) |
| `src/sources/google.ts` | Source Google Programmable Search sur `linkedin.com/in` |
| `src/score.ts` | Scoring Claude avec sortie structurée (score 0-100, verdict, nationalité, tranche d'âge estimée, signaux, points d'attention, accroche) |
| `src/run.ts` | Orchestrateur : rotation des recettes, dédoublonnage, pré-filtre, scoring, shortlist, email |
| `src/email.ts` | Rendu HTML du digest et envoi SMTP |
| `src/state.ts` | Mémoire persistante (`data/state.json`, commitée par le workflow) |
| `.github/workflows/cofounder-scout.yml` | Cron quotidien 08:30 Paris |

## Mise en place (15 min)

### 1. Clés

- **Anthropic** : `ANTHROPIC_API_KEY` sur https://console.anthropic.com
- **Apollo.io** (recommandé) : Settings → Integrations → API → `APOLLO_API_KEY`. Le plan gratuit suffit pour People Search.
- **Google Programmable Search** (recommandé en complément) :
  1. https://programmablesearchengine.google.com → créer un moteur, activer « Rechercher sur l'ensemble du Web » → récupérer le `cx` (`GOOGLE_CSE_CX`)
  2. Google Cloud → activer « Custom Search JSON API » → créer une clé (`GOOGLE_CSE_KEY`). Gratuit jusqu'à 100 requêtes/jour, le bot en fait 6 par défaut.
- **Gmail** : activer la validation en 2 étapes puis créer un **mot de passe d'application** (`SMTP_PASS`). `SMTP_USER` = l'adresse Gmail. `DIGEST_TO` = l'adresse qui reçoit la shortlist.

Au moins une des deux sources doit être configurée.

### 2. Secrets GitHub

Dans le repo : Settings → Secrets and variables → Actions.

Secrets : `ANTHROPIC_API_KEY`, `APOLLO_API_KEY`, `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX`, `SMTP_USER`, `SMTP_PASS`, `DIGEST_TO`.

Variable (optionnelle) : `SCOUT_CAMPAIGN_END` au format `YYYY-MM-DD` (défaut : 2026-11-10).

### 3. Premier lancement

Actions → « Cofounder Scout (daily) » → Run workflow, coche `dry_run` pour un test sans email. Ensuite le cron prend le relais chaque matin.

## En local

```bash
cd cofounder-scout
npm install
cp .env.example .env   # remplir
set -a; source .env; set +a

npm run scout:mock   # pipeline complet sans aucune clé (données factices)
npm run scout:dry    # vraies sources + vrai scoring, sans email, état non sauvegardé
npm run scout        # run complet
npm test
```

Le dernier digest rendu est toujours écrit dans `data/last-digest.html`.

## Réglages

| Variable | Défaut | Effet |
|---|---|---|
| `SCOUT_SHORTLIST_SIZE` | 5 | Profils par email |
| `SCOUT_MIN_SCORE` | 60 | Score minimum pour être retenu |
| `SCOUT_RECIPES_PER_DAY` | 3 | Recettes interrogées par jour (12 recettes au total, rotation) |
| `SCOUT_MAX_TO_SCORE` | 40 | Plafond de profils envoyés à Claude par jour (maîtrise du coût) |
| `SCOUT_MODEL` | `claude-opus-5` | Modèle de scoring |
| `APOLLO_LOCATIONS` | `Paris, France` | Filtre géographique Apollo |

Coût indicatif : ~40 évaluations/jour × ~1 500 tokens ≈ quelques centimes par jour avec Opus 5, le prompt système étant mis en cache.

## Limites à connaître

- Le score, la nationalité et l'âge sont **estimés** à partir du titre et de l'extrait public LinkedIn. Le digest le rappelle. À vérifier avant tout contact.
- Google indexe les profils LinkedIn de façon partielle : certains jours une recette peut remonter peu de nouveaux profils. Apollo compense.
- Google CSE plafonne à 100 résultats par requête : après ~5 passages sur une même recette, il faut en ajouter de nouvelles dans `src/icp.ts`.
