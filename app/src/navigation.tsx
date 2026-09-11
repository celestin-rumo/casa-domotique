// L'onglet affiché, et la page ouverte par-dessus : l'édition d'une ambiance,
// ou sa création. La page entre dans l'historique du navigateur, pour que le
// geste retour du natel — et le bouton retour d'Android — la referment au
// lieu de quitter l'app.
//
// L'onglet vit ici plutôt que dans App.tsx pour qu'une vue puisse en ouvrir
// une autre : la carte du réveil mène à ses réglages, sur l'écran Réglages.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Onglet = "ambiances" | "pieces" | "ecoute" | "reglages";

// `nouvelle` : la place est libre, la page la remplit.
export type Page = { type: "ambiance"; id: string; nouvelle?: boolean };

type Navigation = {
  page: Page | null;
  ouvrir: (p: Page) => void;
  fermer: () => void;
  onglet: Onglet;
  // `ancre` : l'id d'un élément de l'onglet, à amener à l'écran.
  choisirOnglet: (o: Onglet, ancre?: string) => void;
  ancre: string | null;
  oublierAncre: () => void;
};

const Ctx = createContext<Navigation | null>(null);

export function useNavigation(): Navigation {
  const n = useContext(Ctx);
  if (!n) throw new Error("useNavigation hors de <NavigationProvider>");
  return n;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("ambiances");
  const [ancre, setAncre] = useState<string | null>(null);

  // Retour comme avance : la page est celle que l'historique porte.
  useEffect(() => {
    const suivre = (e: PopStateEvent) => setPage((e.state?.casa as Page | undefined) ?? null);
    window.addEventListener("popstate", suivre);
    return () => window.removeEventListener("popstate", suivre);
  }, []);

  const ouvrir = useCallback((p: Page) => {
    history.pushState({ casa: p }, "");
    setPage(p);
  }, []);

  // Refermer, c'est revenir en arrière dans l'historique — sinon le geste
  // retour suivant rouvrirait la page qu'on vient de quitter.
  const fermer = useCallback(() => {
    if (history.state?.casa) history.back();
    else setPage(null);
  }, []);

  // Un onglet choisi referme la page ouverte par-dessus.
  const choisirOnglet = useCallback((o: Onglet, a?: string) => {
    if (history.state?.casa) history.back();
    setPage(null);
    setOnglet(o);
    setAncre(a ?? null);
  }, []);

  const oublierAncre = useCallback(() => setAncre(null), []);

  return (
    <Ctx.Provider value={{ page, ouvrir, fermer, onglet, choisirOnglet, ancre, oublierAncre }}>
      {children}
    </Ctx.Provider>
  );
}
