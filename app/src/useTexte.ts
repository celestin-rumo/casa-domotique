import { useEffect, useState } from "react";
import { useMaison } from "./maison";
import { setText } from "./ha";

// Un réglage en texte (input_text) écrit par l'app : la courbe du réveil, ses
// lumières, sa playlist, les épingles. Trois règles, chacune pour un défaut
// qu'on verrait sinon :
//
// - la valeur envoyée reste affichée jusqu'à ce que l'écho la rattrape, sinon
//   l'écran revient un instant en arrière entre l'ordre et la réponse ;
// - deux gestes rapprochés partent l'un de l'autre, pas de l'état d'avant :
//   écrire le second point de la courbe avant l'écho du premier l'effacerait ;
// - un refus remet l'affichage sur ce que le Pi dit vraiment, et la faute
//   reste nommée sur la carte (maison.tsx).
//
// « unknown » et « unavailable » se lisent comme un texte vide : c'est l'état
// d'un helper jamais écrit, et chaque lecteur a sa valeur par défaut.
export function useTexte(id: string): [string, (v: string) => void] {
  const { entities, agir } = useMaison();
  const reel = entities[id]?.state;
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => setLocal(null), [reel]);
  const lu = reel === undefined || reel === "unknown" || reel === "unavailable" ? "" : reel;
  const ecrire = (v: string) => {
    setLocal(v);
    agir(id, () => setText(id, v)).then((ok) => {
      if (!ok) setLocal(null);
    });
  };
  return [local ?? lu, ecrire];
}
