import { useState } from "react";
import { MaisonProvider, useMaison } from "./maison";
import { HOTE, type Liaison } from "./ha";
import { Ambiances } from "./vues/Ambiances";
import { Pieces } from "./vues/Pieces";
import { Ecoute } from "./vues/Ecoute";
import { Reglages } from "./vues/Reglages";

type Onglet = "ambiances" | "pieces" | "ecoute" | "reglages";

// Quatre onglets, chacun avec son mot : une barre d'icônes seules s'apprend,
// celle-ci se lit avec un couteau dans l'autre main.
const ONGLETS: { id: Onglet; titre: string; icone: JSX.Element; vue: () => JSX.Element }[] = [
  {
    id: "ambiances",
    titre: "Ambiances",
    vue: Ambiances,
    icone: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="8" opacity=".45" />
      </svg>
    ),
  },
  {
    id: "pieces",
    titre: "Pièces",
    vue: Pieces,
    icone: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" /><path d="M10 20v-5h4v5" />
      </svg>
    ),
  },
  {
    id: "ecoute",
    titre: "Écoute",
    vue: Ecoute,
    icone: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M5 10v4M9.5 6.5v11M14.5 8.5v7M19 11v2" />
      </svg>
    ),
  },
  {
    id: "reglages",
    titre: "Réglages",
    vue: Reglages,
    icone: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
        <circle cx="16" cy="8" r="2.1" /><circle cx="10" cy="16" r="2.1" />
      </svg>
    ),
  },
];

const LIAISON: Record<Liaison, string> = {
  connexion: `connexion à ${HOTE}…`,
  ok: HOTE,
  perdu: `${HOTE} ne répond plus`,
  erreur: `${HOTE} injoignable — URL ou jeton`,
};

export default function App() {
  return (
    <MaisonProvider>
      <Coquille />
    </MaisonProvider>
  );
}

function Coquille() {
  const { liaison } = useMaison();
  const [onglet, setOnglet] = useState<Onglet>("ambiances");
  const courant = ONGLETS.find((o) => o.id === onglet)!;
  const Vue = courant.vue;
  const index = ONGLETS.indexOf(courant);

  return (
    <main className="screen">
      <header className="appbar">
        <h1>{courant.titre}</h1>
        <p className={`link ${liaison}`} role="status">
          <span className="dot" aria-hidden="true" />
          <span>{LIAISON[liaison]}</span>
        </p>
      </header>

      {/* La clé remonte la vue à chaque changement : l'entrée se rejoue. */}
      <section className="view enter" key={onglet} role="tabpanel" id={`vue-${onglet}`} aria-label={courant.titre}>
        <Vue />
      </section>

      <nav className="tabs" role="tablist" aria-label="Écrans">
        <span className="tab-ind" aria-hidden="true" style={{ transform: `translateX(${index * 100}%)` }} />
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            className="tab"
            role="tab"
            aria-selected={o.id === onglet}
            aria-controls={`vue-${o.id}`}
            onClick={() => setOnglet(o.id)}
          >
            {o.icone}
            {o.titre}
          </button>
        ))}
      </nav>
    </main>
  );
}
