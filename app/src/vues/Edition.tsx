import { useEffect, useRef, useState } from "react";
import { useMaison } from "../maison";
import { LIGHTS, MOODS, PLAYER } from "../config";
import {
  activateScene, enregistrerScene, messageDe, playPlaylist, scenePourLumieres, setLight, setText, toggleLight,
} from "../ha";
import { usePlaylists } from "../bibliotheque";
import { Carte, Etiquette, LigneEtat, NoteFaute, OptionsPlaylists } from "../ui";
import { Lumiere } from "./Pieces";

const lisible = (s: string | undefined) => (s === undefined || s === "unknown" || s === "unavailable" ? "" : s);

// Modifier une ambiance, ouverte par un appui long sur sa tuile.
//
// Les lumières se règlent EN DIRECT : c'est la pièce qu'on regarde, pas un
// formulaire — une couleur d'ambiance se cherche à l'œil. À l'ouverture, la
// scène est appliquée, pour partir de ce que l'ambiance fait aujourd'hui.
// Rien n'est gardé avant « Enregistrer » : quitter laisse la pièce telle
// quelle et l'ambiance inchangée.
//
// La musique, elle, ne part pas à chaque choix : « Écouter » la fait jouer,
// « Enregistrer » l'écrit dans le réglage de l'ambiance
// (packages/ambiances.yaml), avec les lumières.
export function Edition({ id }: { id: string }) {
  const { entities, fautes, agir } = useMaison();
  const { playlists } = usePlaylists();
  const m = MOODS.find((x) => x.id === id);

  // La scène par son identifiant de configuration, pas par un entity_id
  // deviné : Home Assistant tire l'entity_id du NOM de la scène, qui peut
  // différer de l'identifiant — « Réveillé » est devenue scene.reveille pour
  // l'identifiant reveil_debout.
  const scene = m?.scene
    ? Object.values(entities).find((e) => e.entity_id.startsWith("scene.") && e.attributes.id === m.scene)
        ?.entity_id ?? `scene.${m.scene}`
    : null;

  // Une seule fois par ouverture, StrictMode compris.
  const appliquee = useRef(false);
  useEffect(() => {
    if (!scene || appliquee.current) return;
    appliquee.current = true;
    agir(scene, () => activateScene(scene));
  }, [scene, agir]);

  const brut = m?.musique ? entities[m.musique]?.state : undefined;
  const lu = lisible(brut);
  // null : rien de choisi ici, l'écran montre le réglage du Pi.
  const [choix, setChoix] = useState<string | null>(null);
  useEffect(() => setChoix(null), [brut]);
  const [envoi, setEnvoi] = useState(false);
  const [dit, setDit] = useState<{ ok: boolean; texte: string } | null>(null);

  if (!m?.scene || !m.defaut) return <p className="row-meta">Cette ambiance ne se modifie pas.</p>;

  const { label, defaut, musique } = m;
  const sceneId = m.scene;
  const valeur = choix ?? lu;
  const change = choix !== null && choix !== lu;
  const reglable = !!(musique && entities[musique]);
  const connue = valeur === "" || valeur === "aucune" || playlists.some((p) => p.valeur === valeur);
  const nomDefaut = playlists.find((p) => p.valeur === defaut)?.nom ?? defaut;

  async function enregistrer() {
    setEnvoi(true);
    setDit(null);
    try {
      await enregistrerScene(sceneId, label, scenePourLumieres(LIGHTS, entities));
      if (change && musique && choix !== null) await setText(musique, choix);
      setDit({ ok: true, texte: `${label} : ${change ? "lumières et musique enregistrées" : "lumières enregistrées"}` });
    } catch (e) {
      setDit({ ok: false, texte: messageDe(e) });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <LigneEtat fort="Réglée en direct">
        <span>· rien n'est gardé avant « Enregistrer »</span>
      </LigneEtat>
      {scene && <NoteFaute entite={scene} message={fautes[scene]} />}

      <Etiquette>Lumières</Etiquette>
      {LIGHTS.map((l) => (
        <Lumiere
          key={l}
          id={l}
          entite={entities[l]}
          faute={fautes[l]}
          onToggle={() => agir(l, () => toggleLight(l))}
          onRegler={(r) => agir(l, () => setLight(l, r))}
        />
      ))}

      <Etiquette>Musique</Etiquette>
      <Carte faute={!!fautes[PLAYER]}>
        <label className="champ">
          <span className="row-meta">Ce que {label} joue</span>
          <select value={valeur} disabled={!reglable} onChange={(e) => setChoix(e.target.value)}>
            <option value="">Par défaut · {nomDefaut}</option>
            <OptionsPlaylists playlists={playlists} />
            <option value="aucune">Ne pas toucher à la musique</option>
            {/* Un réglage que ces listes ne connaissent pas — une adresse tapée
                dans Home Assistant — reste visible tel quel. */}
            {!connue && <option value={valeur}>{valeur}</option>}
          </select>
        </label>
        {!reglable && (
          <p className="row-meta">packages/ambiances.yaml n'est pas à jour sur le Pi : la musique ne se règle pas encore.</p>
        )}
        <div className="btn-row">
          <button
            className="btn"
            disabled={valeur === "aucune" || !entities[PLAYER]}
            onClick={() => agir(PLAYER, () => playPlaylist(valeur || defaut, PLAYER))}
          >
            Écouter
          </button>
        </div>
        <NoteFaute entite={PLAYER} message={fautes[PLAYER]} />
      </Carte>

      <div className="barre-bas">
        {dit && <p className={`row-meta${dit.ok ? "" : " rate"}`} role="status">{dit.texte}</p>}
        <div className="btn-row">
          <button className="btn" disabled={!scene} onClick={() => scene && agir(scene, () => activateScene(scene))}>
            Revenir à l'enregistrée
          </button>
          <button className="btn primary" disabled={envoi} onClick={enregistrer}>
            {envoi ? "Enregistrement…" : `Enregistrer ${label}`}
          </button>
        </div>
      </div>
    </>
  );
}
