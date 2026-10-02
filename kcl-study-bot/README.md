# KCL Study Bot

Bot en ligne de commande qui récupère tes cours sur **KEATS** (le Moodle de King's College London, celui derrière l'appli KCL Student), les indexe en local, puis en fait des **fiches de révision**, des **résumés**, des **flashcards Anki** et des **examens blancs** — et répond à tes questions et à tes exercices en citant tes propres documents.

Tout reste sur ta machine. Rien n'est republié, rien n'est partagé.

## Comment ça marche

```
        KEATS (Moodle de KCL)
                │
                │  web service mobile — la même API que l'appli officielle
                ▼
   cours → sections → fichiers (.pdf .pptx .docx), pages, énoncés de devoirs
                │
                │  téléchargement incrémental (data/files)
                ▼
   extraction de texte : pdf.js, dézippage Office, nettoyage HTML
                │
                ├─────────────► data/text/*.txt
                │
                ▼
   découpage en passages + index BM25 (data/chunks.jsonl)
                │
      ┌─────────┴──────────┬────────────────────┐
      ▼                    ▼                    ▼
  fiche / resume      flashcards / quiz      ask / solve
  (documents entiers, (sortie structurée    (recherche puis
   PDF envoyés tels    validée par zod)      réponse citée)
   quels à Claude)
                │
                ▼
        data/out/  (Markdown, TSV Anki)
```

Deux chemins de lecture, choisis selon le document :

- **PDF sous 20 Mo et 300 pages** → envoyé tel quel à Claude. Il voit les courbes, les schémas et les formules que l'extraction de texte aplatit. C'est aussi le seul moyen de lire un **polycopié scanné**.
- **Le reste** (gros PDF, .pptx, .docx, pages Moodle) → texte extrait en local, puis envoyé.

Les `.pptx` sont lus **avec les notes du présentateur** : c'est souvent là que le prof écrit l'explication qui n'est pas sur la diapo.

## Installation

```bash
cd kcl-study-bot
npm install
cp .env.example .env     # puis mets ta clé ANTHROPIC_API_KEY dedans
```

### 1. Connecter KEATS

```bash
npm run kcl -- login
```

La commande t'envoie sur <https://keats.kcl.ac.uk/user/managetoken.php> (connecté à KEATS) : copie la clé de la ligne **« Moodle mobile web service »** et colle-la. Elle part dans `data/auth.json`, en lecture seule pour toi (`chmod 600`).

Si cette page est vide ou n'existe pas, passe par le flux de l'appli mobile :

```bash
npm run kcl -- login --launch                      # imprime l'URL du SSO KCL
npm run kcl -- login --url "moodlemobile://token=..."   # colle le lien de retour
```

Vérifie que tout est en place :

```bash
npm run kcl -- doctor
```

### 2. Récupérer les cours

```bash
npm run kcl -- sync                  # tous les cours où tu es inscrit·e
npm run kcl -- sync --course ECON    # seulement ceux qui matchent (répétable)
```

La synchro est **incrémentale** : un fichier dont la date n'a pas changé n'est pas retéléchargé. Relance-la quand le prof dépose de nouvelles slides.

```bash
npm run kcl -- courses        # ce qui est synchronisé
npm run kcl -- docs ECON101   # les documents d'un cours, avec leur id
npm run kcl -- agenda         # ce qui est à rendre dans les 3 semaines
```

## Utilisation

### Fiches et résumés

```bash
npm run kcl -- fiche ECON101 --section "Week 3"
npm run kcl -- fiche ECON101 --grep "elasticity" --focus "les démonstrations"
npm run kcl -- resume ECON101 --doc 5-11-lecture-1-slides-pdf
```

La fiche suit toujours la même ossature : l'essentiel en cinq lignes, concepts clés, formules avec leurs hypothèses, raisonnements à savoir refaire, exemples travaillés, pièges classiques, questions d'examen probables, et **angles morts** — ce que le cours suppose connu sans l'expliquer. C'est souvent la section la plus utile.

### Flashcards

```bash
npm run kcl -- flashcards ECON101 --section "Week 3" --count 40
```

Produit trois fichiers dans `data/out/flashcards/` : un `.basic.tsv` (question/réponse), un `.cloze.tsv` (texte à trous) et un `.md` pour relire le paquet. Dans Anki : **Fichier → Importer**, séparateur « Tabulation » ; les en-têtes du fichier annoncent déjà le type de note et la colonne des tags.

### Examen blanc

```bash
npm run kcl -- quiz ECON101 --section "Week 3" --count 12
```

Un tiers de questions faciles, un tiers d'application, un tiers de transfert. Le **corrigé est à la fin** du fichier : fais le sujet avant de dérouler. Les mauvaises réponses d'un QCM sont des erreurs réelles (signe inversé, mauvaise unité, confusion entre deux notions voisines), pas du remplissage.

### Questions et exercices

```bash
npm run kcl -- ask "pourquoi la courbe de demande est-elle décroissante ?"
npm run kcl -- ask "définis marginal cost" --course ECON101
npm run kcl -- solve "un monopole a c(q)=2q², demande p=100-q. Quantité optimale ?"
npm run kcl -- solve --file enonce.txt --save
```

- `ask` cherche dans tes cours, répond, et cite ses sources (`[S1]`, `[S2]` avec le document et la page ou la diapo).
- `solve` ne donne pas juste le résultat : il reformule l'énoncé, nomme **la méthode du cours** et où elle a été vue, déroule les étapes avec leur justification, encadre le résultat, et explique comment le vérifier seul·e.

Dans les deux cas, si tes documents ne couvrent pas la question, le bot le dit **avant** de répondre, et annonce la réponse générale comme telle.

```bash
npm run kcl -- search "elasticity"     # recherche locale, aucun appel à l'API
```

## Filtres

Valables pour `fiche`, `resume`, `flashcards` et `quiz` :

| Filtre | Effet |
|---|---|
| `--section "Week 3"` | Par section du cours (répétable) |
| `--doc <id>` | Un document précis — l'id vient de `docs` (répétable) |
| `--grep <mot>` | Les documents dont le titre contient ce mot |
| `--focus "<consigne>"` | Oriente la génération sans changer le périmètre |
| `--all` | Confirme un périmètre de plus de 25 documents |
| `--out <fichier>` | Chemin de sortie |
| `--print` | Affiche le résultat en plus de l'écrire |

Sans filtre, la commande prend tout le cours et **refuse de partir** au-delà de 25 documents : une fiche sur un semestre entier coûte cher et donne de la bouillie. Elle te liste alors les sections pour que tu choisisses.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/ai/prompts.ts` | **Les consignes données à Claude.** C'est le fichier à éditer pour changer le style des fiches, ce qu'une bonne flashcard doit être, ou la méthode de résolution. |
| `src/keats/client.ts` | Transport web service Moodle : notation tableau PHP, réessais, URLs de fichiers signées |
| `src/keats/api.ts` | Les fonctions Moodle utilisées, typées |
| `src/keats/login.ts` | Récupération du jeton (page des clés, ou flux SSO de l'appli mobile) |
| `src/keats/sync.ts` | Parcours des cours, téléchargement incrémental, extraction, indexation |
| `src/extract/` | pdf.js, dézippage `.pptx`/`.docx`, nettoyage HTML |
| `src/chunk.ts` | Découpage en passages, avec le repère de page ou de diapo pour la citation |
| `src/search.ts` | Index BM25 local et fusion de requêtes reformulées |
| `src/ai/context.ts` | Choisit, par document, entre PDF natif et texte extrait ; pose les points de cache |
| `src/ai/fiche.ts`, `flashcards.ts`, `quiz.ts`, `ask.ts` | Les quatre générateurs |
| `src/select.ts` | Traduit les filtres en liste de documents, avec le garde-fou de périmètre |

## Ce que ça coûte

Chaque commande de génération est **un seul appel** à Claude (plus un petit appel bon marché pour reformuler la requête dans `ask`/`solve`). Le préfixe du contexte est mis en cache, donc enchaîner `fiche` puis `flashcards` puis `quiz` sur la même section coûte beaucoup moins cher que trois appels à froid — fais-les à la suite.

`search`, `courses`, `docs` et `reindex` ne touchent jamais à l'API : ils sont gratuits.

Pour réduire la facture : `KCL_EFFORT=medium` sur de la révision de routine, et vise une section plutôt qu'un cours entier.

## Garde-fous

Le prompt impose trois choses, et c'est volontaire :

- **Zéro invention.** Si une notion est citée dans les slides sans y être définie, le bot l'écrit au lieu de combler le trou avec ses connaissances générales. Une fiche qui dit « les slides mentionnent X sans le définir » t'envoie chercher au bon endroit.
- **Citation systématique.** Chaque affirmation porte l'étiquette de sa source, et la légende en bas de fiche donne le document, la page ou la diapo, et le lien KEATS. Tu peux tout vérifier.
- **Terminologie anglaise conservée.** Tes examens sont en anglais : le bot garde `marginal cost` et explique en français, il ne traduit pas le vocabulaire que tu devras restituer.

## Limites connues

- **Les PDF scannés** n'ont pas de texte extractible : ils sortent de l'index de recherche (`search`, `ask`, `solve` ne les voient pas) mais `fiche` et `flashcards` les lisent quand même, en envoyant le PDF tel quel à Claude. Un `!` devant un document dans `docs` signale ce cas.
- **Les vidéos, images, `.xlsx` et les vieux `.doc`/`.ppt` binaires** sont ignorés.
- **Les quiz Moodle et les forums** ne sont pas récupérés — seuls les fichiers, les pages et les énoncés de devoirs le sont.
- **Si KCL coupait le service web mobile**, `doctor` te le dira ligne par ligne. Il n'y a alors pas de contournement propre côté bot : c'est une autorisation côté serveur.
- **Un gros PDF au-delà du budget de contexte** est tronqué — le bot te le dit explicitement avec le nombre de caractères retenus, il ne le fait pas en silence.

## Développement

```bash
npm run typecheck
npm test
```

Les tests ne touchent ni à KEATS ni à l'API Claude : ils fabriquent leurs propres `.pptx`, `.docx` et `.pdf` en mémoire (`src/extract/fixtures.ts`) et couvrent l'extraction, le découpage, le BM25, l'analyse des arguments, la sérialisation des paramètres Moodle, la signature du flux de connexion et l'export Anki.

## Une note sur l'usage

Le bot se connecte avec **ton** compte, à **tes** cours, via l'API que l'appli officielle KCL utilise déjà, et il reste en dessous d'une poignée de requêtes simultanées. Les supports de cours restent la propriété de leurs auteurs : garde `data/` sur ta machine et ne rediffuse pas les fichiers ni les fiches qui en dérivent. `data/` est dans le `.gitignore` pour cette raison.
