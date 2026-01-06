import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="flex items-center justify-between">
        <div className="text-xl font-extrabold tracking-tight">SafeDeal</div>
        <div className="flex gap-2">
          <Link href="/auth"><Button variant="secondary">Se connecter</Button></Link>
          <Link href="/auth"><Button>Créer un SafeDeal</Button></Link>
        </div>
      </header>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="p-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            🔒 L’argent est bloqué. Pas promis.
          </div>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight">
            Paiements sécurisés entre inconnus, design premium.
          </h1>
          <p className="mt-3 text-white/70">
            SafeDeal verrouille l’argent, puis le libère au vendeur uniquement après réception conforme.
            Chat interne, anonymat entre parties, et compte à rebours clair.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/auth"><Button>Ouvrir l’app</Button></Link>
            <a href="#how"><Button variant="secondary">Voir comment ça marche</Button></a>
          </div>
        </Card>

        <Card className="p-7">
          <h2 className="text-lg font-bold">Pourquoi c’est différent</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold">⏱️ Compte à rebours central</div>
              <div className="mt-1 text-sm text-white/65">Tout est prévisible : libération, délais, actions requises.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold">🙈 Anonymat</div>
              <div className="mt-1 text-sm text-white/65">Pseudos par deal, chat interne, blocage des coordonnées.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold">💬 Chat probant</div>
              <div className="mt-1 text-sm text-white/65">Historique horodaté utilisable en cas de litige.</div>
            </div>
          </div>
        </Card>
      </section>

      <section id="how" className="mt-10 grid gap-4 lg:grid-cols-3">
        {[
          { k: "1", t: "Créer le SafeDeal", d: "Montant, règles, délais." },
          { k: "2", t: "L’argent est verrouillé", d: "Visible, mais intouchable jusqu’à validation." },
          { k: "3", t: "Livraison → validation", d: "OK, litige, ou libération automatique." }
        ].map((s) => (
          <Card key={s.k} className="p-6">
            <div className="text-teal-200 text-xs font-bold">ÉTAPE {s.k}</div>
            <div className="mt-2 text-lg font-bold">{s.t}</div>
            <div className="mt-2 text-sm text-white/70">{s.d}</div>
          </Card>
        ))}
      </section>

      <footer className="mt-12 text-sm text-white/55">
        © {new Date().getFullYear()} SafeDeal — Prototype MVP.
      </footer>
    </main>
  );
}
