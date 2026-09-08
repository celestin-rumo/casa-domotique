// L'état de la maison tel que le Pi le raconte, et la seule façon d'agir
// dessus. Chaque vue le lit ; aucune ne parle à ha.ts directement.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { HassEntities } from "home-assistant-js-websocket";
import { onEntities, onLiaison, activateScene, messageDe, type Liaison } from "./ha";
import { MOODS, MOOD_SELECT, ECHO_DELAI_MS } from "./config";
import { setupNative, tap } from "./native";

// Entité → phrase. Une faute reste affichée sur sa carte jusqu'à ce qu'une
// action sur la même entité réussisse : jamais un toast anonyme qui s'efface.
export type Fautes = Record<string, string>;

type Maison = {
  entities: HassEntities;
  liaison: Liaison;
  fautes: Fautes;
  // Toute action passe par ici : haptique, puis le refus nommé s'il y en a un.
  agir: (entite: string, action: () => Promise<void>) => Promise<boolean>;
  // L'ambiance affichée comme acquise, en attente de l'écho du Pi.
  attente: string | null;
  // L'écho vient d'arriver : le trait finit sa course, puis disparaît.
  confirmee: string | null;
  ambiance: (id: string) => void;
};

const Ctx = createContext<Maison | null>(null);

export function useMaison(): Maison {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMaison hors de <MaisonProvider>");
  return m;
}

function sans(fautes: Fautes, entite: string): Fautes {
  if (!(entite in fautes)) return fautes;
  const reste = { ...fautes };
  delete reste[entite];
  return reste;
}

export function MaisonProvider({ children }: { children: ReactNode }) {
  const [entities, setEntities] = useState<HassEntities>({});
  const [liaison, setLiaison] = useState<Liaison>("connexion");
  const [fautes, setFautes] = useState<Fautes>({});
  const [attente, setAttente] = useState<string | null>(null);
  const [confirmee, setConfirmee] = useState<string | null>(null);

  useEffect(() => {
    setupNative();
    // StrictMode monte deux fois : ce qui se résout après le démontage doit
    // se désabonner tout seul, sinon la première souscription fuit.
    let vivant = true;
    const arrets: (() => void)[] = [];
    const garder = (u: () => void) => (vivant ? arrets.push(u) : u());
    onEntities((e) => {
      if (!vivant) return;
      setEntities(e);
      setLiaison("ok");
    })
      .then(garder)
      .catch(() => vivant && setLiaison("erreur"));
    onLiaison((etat) => vivant && setLiaison(etat))
      .then(garder)
      .catch(() => {});
    return () => {
      vivant = false;
      arrets.forEach((u) => u());
    };
  }, []);

  const courante = entities[MOOD_SELECT]?.state;

  // L'écho : l'ambiance en attente est devenue la courante. Une ambiance
  // confirmée efface les fautes des autres — une note « Focus n'a pas
  // répondu » sous une grille où Tout éteindre vient d'être confirmé ne
  // renseigne plus, elle encombre.
  useEffect(() => {
    if (attente && courante === attente) {
      setAttente(null);
      setConfirmee(attente);
      setFautes((f) => MOODS.reduce((reste, m) => sans(reste, m.id), f));
    }
  }, [attente, courante]);

  useEffect(() => {
    if (!confirmee) return;
    const t = setTimeout(() => setConfirmee(null), 700);
    return () => clearTimeout(t);
  }, [confirmee]);

  // Sans écho dans le délai : retour arrière, en nommant le script.
  useEffect(() => {
    if (!attente) return;
    const t = setTimeout(() => {
      setAttente(null);
      setFautes((f) => ({ ...f, [attente]: "pas de confirmation dans les temps" }));
    }, ECHO_DELAI_MS);
    return () => clearTimeout(t);
  }, [attente]);

  const agir = useCallback(async (entite: string, action: () => Promise<void>) => {
    tap();
    try {
      await action();
      setFautes((f) => sans(f, entite));
      return true;
    } catch (e) {
      setFautes((f) => ({ ...f, [entite]: messageDe(e) }));
      return false;
    }
  }, []);

  const ambiance = useCallback(
    async (id: string) => {
      setFautes((f) => sans(f, id));
      setAttente(id); // 0 ms : acquise à l'écran, l'écho tranchera
      if (!(await agir(id, () => activateScene(id)))) setAttente(null);
    },
    [agir]
  );

  return (
    <Ctx.Provider value={{ entities, liaison, fautes, agir, attente, confirmee, ambiance }}>
      {children}
    </Ctx.Provider>
  );
}
