import { useMemo, useState } from "react";
import { useBibliotheque } from "../bibliotheque";
import type { PlaylistBib } from "../ha";
import { NoteFaute } from "../ui";

const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Chercher dans toute la bibliothèque de Music Assistant — plus de cent
// playlists sur ce compte. Elle n'est demandée qu'au montage, puis la
// recherche se fait sur le natel, à chaque lettre, sans repasser par le Pi.
// Ce que fait un toucher dépend de l'écran : épingler dans Écoute, choisir
// la musique d'une ambiance, ou ce que joue un nom de la table.
export function RecherchePlaylist({ disabled = false, autoFocus = false, active, sousTitre, surChoisir }: {
  disabled?: boolean;
  autoFocus?: boolean;
  active: (p: PlaylistBib) => boolean;
  sousTitre: (p: PlaylistBib, active: boolean) => string;
  surChoisir: (p: PlaylistBib) => void;
}) {
  const [q, setQ] = useState("");
  const { items, erreur } = useBibliotheque(true);

  const trouvees = useMemo(() => {
    const n = normaliser(q.trim());
    if (!items || n.length < 2) return [];
    return items.filter((p) => normaliser(p.name).includes(n)).slice(0, 20);
  }, [items, q]);

  return (
    <>
      <input
        type="search"
        className="recherche"
        placeholder="Chercher dans ta bibliothèque…"
        aria-label="Chercher une playlist"
        value={q}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
      />
      <NoteFaute entite="music_assistant.get_library" message={erreur ?? undefined} />
      {!items && !erreur && <p className="row-meta">bibliothèque en chargement…</p>}
      {items && q.trim().length < 2 && <p className="row-meta">{items.length} playlists dans ta bibliothèque · deux lettres suffisent</p>}
      {items && q.trim().length >= 2 && trouvees.length === 0 && <p className="row-meta">rien ne correspond</p>}
      {trouvees.map((p) => {
        const a = active(p);
        return (
          <button key={p.uri} className="prow" aria-pressed={a} disabled={disabled} onClick={() => surChoisir(p)}>
            <span className="prow-text">
              <span className="prow-name">{p.name}</span>
              <span className="prow-sub">{sousTitre(p, a)}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}
