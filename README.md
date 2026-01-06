# SafeDeal — Web app (MVP) + chat interne (Supabase)

Projet **prêt à déployer** (Next.js + Tailwind + Supabase).

## Ce que tu obtiens
- Landing page premium (style Revolut)
- Auth email/mot de passe
- Dashboard avec cartes + compte à rebours
- Création de deal
- Page deal + chat interne temps réel

## Déploiement (simple)
1) **Supabase**
- Créer un projet
- SQL Editor → exécuter `supabase/schema.sql`
- Database → Replication → activer Realtime pour `messages`
- Récupérer `Project URL` + `anon public key`

2) **Vercel**
- Importer le repo GitHub
- Environment Variables :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Deploy
