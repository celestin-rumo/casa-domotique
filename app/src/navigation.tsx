// Une page par-dessus les onglets : aujourd'hui, l'édition d'une ambiance.
// Elle entre dans l'historique du navigateur, pour que le geste retour du
// natel — et le bouton retour d'Android — la referment au lieu de quitter
// l'app.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Page = { type: "ambiance"; id: string };

type Navigation = {
  page: Page | null;
  ouvrir: (p: Page) => void;
  fermer: () => void;
};

const Ctx = createContext<Navigation | null>(null);

export function useNavigation(): Navigation {
  const n = useContext(Ctx);
  if (!n) throw new Error("useNavigation hors de <NavigationProvider>");
  return n;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page | null>(null);

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

  return <Ctx.Provider value={{ page, ouvrir, fermer }}>{children}</Ctx.Provider>;
}
