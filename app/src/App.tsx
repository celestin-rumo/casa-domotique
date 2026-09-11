import { useEffect } from "react";
import { MaisonProvider, useMaison } from "./maison";
import { NavigationProvider, useNavigation, type Onglet } from "./navigation";
import { HOTE, type Liaison } from "./ha";
import { listeAmbiances } from "./ambiances";
import { Ambiances } from "./vues/Ambiances";
import { Pieces } from "./vues/Pieces";
import { Ecoute } from "./vues/Ecoute";
import { Reglages } from "./vues/Reglages";
import { Edition } from "./vues/Edition";

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
      <NavigationProvider>
        <Coquille />
      </NavigationProvider>
    </MaisonProvider>
  );
}

function Coquille() {
  const { entities, liaison } = useMaison();
  const { page, fermer, onglet, choisirOnglet, ancre, oublierAncre } = useNavigation();
  const courant = ONGLETS.find((o) => o.id === onglet)!;
  const Vue = courant.vue;
  const index = ONGLETS.indexOf(courant);
  // Une page ouverte par-dessus l'onglet : l'édition d'une ambiance, ou sa
  // création.
  const titrePage = !page ? null
    : page.nouvelle ? "Nouvelle ambiance"
    : listeAmbiances(entities).find((a) => a.id === page.id)?.label ?? "Ambiance";

  // Une vue qui en ouvre une autre à un endroit précis : la carte du réveil
  // mène à ses réglages. L'effet passe après le rendu de la nouvelle vue.
  useEffect(() => {
    if (!ancre) return;
    const t = requestAnimationFrame(() => {
      const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(ancre)?.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
      oublierAncre();
    });
    return () => cancelAnimationFrame(t);
  }, [ancre, onglet, oublierAncre]);

  return (
    <main className="screen">
      <header className="appbar">
        {page ? (
          <div className="appbar-titre">
            <button className="retour" aria-label="Retour aux ambiances" onClick={fermer}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            </button>
            <h1>{titrePage}</h1>
          </div>
        ) : (
          <h1>{courant.titre}</h1>
        )}
        <p className={`link ${liaison}`} role="status">
          <span className="dot" aria-hidden="true" />
          <span>{LIAISON[liaison]}</span>
        </p>
      </header>

      {/* La clé remonte la vue à chaque changement : l'entrée se rejoue. */}
      {page ? (
        <section className="view enter" key={`page-${page.id}`} aria-label={titrePage ?? undefined}>
          <Edition id={page.id} nouvelle={page.nouvelle} />
        </section>
      ) : (
        <section className="view enter" key={onglet} role="tabpanel" id={`vue-${onglet}`} aria-label={courant.titre}>
          <Vue />
        </section>
      )}

      <nav className="tabs" role="tablist" aria-label="Écrans">
        <span className="tab-ind" aria-hidden="true" style={{ transform: `translateX(${index * 100}%)` }} />
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            className="tab"
            role="tab"
            aria-selected={o.id === onglet}
            aria-controls={`vue-${o.id}`}
            onClick={() => choisirOnglet(o.id)}
          >
            {o.icone}
            {o.titre}
          </button>
        ))}
      </nav>
    </main>
  );
}
