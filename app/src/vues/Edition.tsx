import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMaison } from "../maison";
import { useNavigation } from "../navigation";
import { LIGHTS, PLAYER } from "../config";
import {
  activateScene, enregistrerScene, messageDe, playPlaylist, scenePourLumieres, setLight, setNumber, setText,
  setVolume, supprimerScene, toggleLight,
} from "../ha";
import { usePlaylists } from "../bibliotheque";
import {
  NOM_MAX, PLACES, TEINTES, ecrirePerso, listeAmbiances, plafond, sansMusique, sceneDe, volumeRegle,
} from "../ambiances";
import { Carte, Curseur, Etiquette, LigneEtat, NoteFaute, OptionsPlaylists, Question } from "../ui";
import { Lumiere } from "./Pieces";

const lisible = (s: string | undefined) => (s === undefined || s === "unknown" || s === "unavailable" ? "" : s);

// Modifier une ambiance, ouverte par un appui long sur sa tuile — ou en
// créer une, depuis la tuile « Nouvelle ».
//
// Les lumières se règlent EN DIRECT : c'est la pièce qu'on regarde, pas un
// formulaire — une couleur d'ambiance se cherche à l'œil. À l'ouverture, la
// scène est appliquée, pour partir de ce que l'ambiance fait aujourd'hui ;
// une ambiance neuve part de la pièce telle qu'elle est. Le volume aussi se
// règle en direct, sur la WiiM : il s'entend avant de s'enregistrer.
//
// Rien n'est gardé avant « Enregistrer » : quitter laisse la pièce telle
// quelle et l'ambiance inchangée. La musique ne part pas à chaque choix :
// « Écouter » la fait jouer.
//
// Deux sortes d'ambiances, un seul écran. Celles du dépôt gardent leur nom ;
// leur musique et leur volume sont des helpers (packages/ambiances.yaml).
// Les ajoutées ont un nom et une teinte, et tout tient dans le JSON de leur
// place ; elles seules se suppriment.
export function Edition({ id, nouvelle = false }: { id: string; nouvelle?: boolean }) {
  const { entities, fautes, agir } = useMaison();
  const { fermer } = useNavigation();
  const { playlists } = usePlaylists();
  const ambiances = listeAmbiances(entities);
  const a = ambiances.find((x) => x.id === id);
  const place = PLACES.find((p) => p.id === id) ?? null;
  // Figée à l'ouverture : une fois créée, l'ambiance existe, et l'écran ne
  // doit pas se mettre à appliquer sa scène avant de se refermer.
  const creation = useRef(nouvelle && !a).current;
  const reglage = a?.perso?.reglage;

  // La scène par son identifiant de configuration, pas par un entity_id
  // deviné : Home Assistant tire l'entity_id du NOM de la scène.
  const configScene = a?.scene ?? place?.scene;
  const scene = configScene ? sceneDe(entities, configScene) ?? (place ? null : `scene.${configScene}`) : null;

  // Une seule fois par ouverture, StrictMode compris.
  const appliquee = useRef(false);
  useEffect(() => {
    if (creation || !scene || appliquee.current) return;
    appliquee.current = true;
    agir(scene, () => activateScene(scene));
  }, [creation, scene, agir]);

  // Le nom et la teinte d'une ajoutée. Neuve, elle prend la première teinte
  // qu'aucune tuile ne porte.
  const [nom, setNom] = useState(reglage?.n ?? "");
  const [teinte, setTeinte] = useState(
    () => reglage?.c ?? TEINTES.find((t) => !ambiances.some((x) => x.hue === t)) ?? TEINTES[0],
  );

  // La musique telle que le Pi la dit. Pour une ambiance du dépôt, "" est sa
  // playlist par défaut ; pour une ajoutée, qui n'en a pas, « aucune ».
  const lu = place ? (reglage && !sansMusique(reglage.m) ? reglage.m : "aucune")
    : a?.musique ? lisible(entities[a.musique]?.state) : "";
  // null : rien de choisi ici, l'écran montre le réglage du Pi.
  const [choix, setChoix] = useState<string | null>(null);
  useEffect(() => setChoix(null), [lu]);

  // Le volume : celui de l'ambiance, sinon — neuve, ou ajoutée qui n'y
  // touche pas — celui de la WiiM en ce moment. Jamais au-dessus du plafond,
  // puisque le Pi l'y ramènerait.
  const cap = plafond(entities);
  const volumeLu = a ? volumeRegle(a, entities) : null;
  const actuel = Math.round((entities[PLAYER]?.attributes.volume_level ?? 0.05) * 100);
  const [volume, setVol] = useState<number | null>(null);

  const [envoi, setEnvoi] = useState(false);
  const [dit, setDit] = useState<{ ok: boolean; texte: string } | null>(null);
  const [aSupprimer, setASupprimer] = useState(false);

  if (!creation && !a) return <p className="row-meta">Cette ambiance n'existe plus.</p>;
  if (!creation && !a?.scene) return <p className="row-meta">Cette ambiance ne se modifie pas.</p>;

  const titre = place ? nom.trim() || "cette ambiance" : a!.label;
  const valeur = choix ?? lu;
  const musiqueChangee = choix !== null && choix !== lu;
  const placeLa = !!(place && entities[place.texte]);
  const musiqueReglable = place ? placeLa : !!(a?.musique && entities[a.musique]);
  const volumeReglable = place ? placeLa : !!(a?.volume && entities[a.volume]);
  const volumeAffiche = Math.max(1, Math.min(cap, volume ?? volumeLu ?? actuel));
  const volumeChange = volume !== null && volume !== volumeLu;
  const connue = valeur === "" || valeur === "aucune" || playlists.some((p) => p.valeur === valeur);
  const defaut = a?.defaut;
  const nomDefaut = playlists.find((p) => p.valeur === defaut)?.nom ?? defaut;

  async function enregistrer() {
    setEnvoi(true);
    setDit(null);
    try {
      const lumieres = scenePourLumieres(LIGHTS, entities);
      if (place) {
        const n = nom.trim();
        if (!n) throw new Error("donne-lui un nom d'abord");
        const texte = ecrirePerso({
          n,
          c: teinte,
          m: valeur === "aucune" ? "" : valeur,
          // Pas touché : ce qui était enregistré, 0 compris ; neuve, ce
          // qu'affiche le curseur.
          v: volume ?? (reglage ? reglage.v : volumeAffiche),
        });
        // Le plafond d'un input_text : on le dit ici plutôt que de laisser
        // Home Assistant refuser.
        if (texte.length > 255) throw new Error("trop long pour Home Assistant : raccourcis le nom");
        // La scène d'abord : une place remplie sans scène serait une tuile
        // qui ne change pas la lumière.
        await enregistrerScene(place.scene, n, lumieres, true);
        await setText(place.texte, texte);
        if (creation) {
          fermer();
          return;
        }
        setDit({ ok: true, texte: `${n} : enregistrée` });
      } else if (a?.scene) {
        await enregistrerScene(a.scene, a.label, lumieres);
        if (musiqueChangee && a.musique && choix !== null) await setText(a.musique, choix);
        if (volumeChange && a.volume && volume !== null) await setNumber(a.volume, volume);
        const quoi = ["lumières", musiqueChangee && "musique", volumeChange && "volume"].filter(Boolean).join(", ");
        setDit({ ok: true, texte: `${a.label} : ${quoi} enregistrés` });
      }
    } catch (e) {
      setDit({ ok: false, texte: messageDe(e) });
    } finally {
      setEnvoi(false);
    }
  }

  // Le texte vidé libère la place ; la scène part avec. Une scène déjà
  // absente n'est pas une erreur (ha.ts).
  async function supprimer() {
    setASupprimer(false);
    if (!place) return;
    setEnvoi(true);
    try {
      await setText(place.texte, "");
      await supprimerScene(place.scene);
      fermer();
    } catch (e) {
      setDit({ ok: false, texte: messageDe(e) });
      setEnvoi(false);
    }
  }

  // Au volume de l'ambiance, pour entendre ce qu'elle donnera.
  const ecouter = () =>
    agir(PLAYER, async () => {
      await setVolume(PLAYER, volumeAffiche / 100);
      await playPlaylist(valeur || defaut || "", PLAYER);
    });

  return (
    <>
      <LigneEtat fort={creation ? "Nouvelle ambiance" : "Réglée en direct"}>
        <span>· rien n'est gardé avant « {creation ? "Créer" : "Enregistrer"} »</span>
      </LigneEtat>
      {scene && <NoteFaute entite={scene} message={fautes[scene]} />}

      {place && (
        <>
          <Etiquette>Nom et teinte</Etiquette>
          <Carte faute={!!fautes[place.texte]}>
            <label className="champ">
              <span className="row-meta">Le nom de la tuile</span>
              <input
                className="recherche"
                value={nom}
                maxLength={NOM_MAX}
                placeholder="Soirée, Lecture, Sieste…"
                autoFocus={creation}
                onChange={(e) => setNom(e.target.value)}
              />
            </label>
            <div className="teintes" role="radiogroup" aria-label="Teinte de la tuile">
              {TEINTES.map((t) => (
                <button
                  key={t}
                  className="teinte"
                  role="radio"
                  aria-checked={t === teinte}
                  aria-label={`teinte ${t}`}
                  style={{ "--t": t } as CSSProperties}
                  onClick={() => setTeinte(t)}
                />
              ))}
            </div>
            {!placeLa && (
              <p className="row-meta">packages/ambiances.yaml n'est pas à jour sur le Pi : rien ne peut encore y être enregistré.</p>
            )}
            <NoteFaute entite={place.texte} message={fautes[place.texte]} />
          </Carte>
        </>
      )}

      <Etiquette>Lumières</Etiquette>
      {creation && <p className="astuce">Elles partent de la pièce telle qu'elle est : règle-les à l'œil.</p>}
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

      <Etiquette>Musique et volume</Etiquette>
      <Carte faute={!!fautes[PLAYER]}>
        <label className="champ">
          <span className="row-meta">Ce que {titre} joue</span>
          <select value={valeur} disabled={!musiqueReglable} onChange={(e) => setChoix(e.target.value)}>
            {!place && <option value="">Par défaut · {nomDefaut}</option>}
            <OptionsPlaylists playlists={playlists} />
            <option value="aucune">Ne pas toucher à la musique</option>
            {/* Un réglage que ces listes ne connaissent pas — une adresse tapée
                dans Home Assistant — reste visible tel quel. */}
            {!connue && <option value={valeur}>{valeur}</option>}
          </select>
        </label>
        {!musiqueReglable && !place && (
          <p className="row-meta">packages/ambiances.yaml n'est pas à jour sur le Pi : la musique ne se règle pas encore.</p>
        )}

        <Curseur
          id="edition-volume"
          label="Volume de la WiiM"
          min={1}
          max={Math.max(cap, 2)}
          valeur={volumeAffiche}
          disabled={!volumeReglable || !entities[PLAYER]}
          onCommit={(v) => {
            const n = Math.round(v);
            setVol(n);
            // En direct, comme les lumières : on l'entend avant de le garder.
            agir(PLAYER, () => setVolume(PLAYER, n / 100));
          }}
        />
        <p className="row-meta">
          {!volumeReglable && !place
            ? "le volume ne se règle pas encore : le Pi n'a pas redémarré depuis le git pull"
            : cap < 100 ? `plafond de la WiiM : ${cap} % · Réglages → Son` : "pas de plafond · Réglages → Son"}
        </p>

        <div className="btn-row">
          <button className="btn" disabled={valeur === "aucune" || !entities[PLAYER]} onClick={ecouter}>
            Écouter
          </button>
        </div>
        <NoteFaute entite={PLAYER} message={fautes[PLAYER]} />
      </Carte>

      {place && !creation && (
        <div className="btn-row">
          <button className="btn danger" disabled={envoi} onClick={() => setASupprimer(true)}>
            Supprimer {titre}
          </button>
        </div>
      )}

      <div className="barre-bas">
        {dit && <p className={`row-meta${dit.ok ? "" : " rate"}`} role="status">{dit.texte}</p>}
        <div className="btn-row">
          {!creation && (
            <button className="btn" disabled={!scene} onClick={() => scene && agir(scene, () => activateScene(scene))}>
              Revenir à l'enregistrée
            </button>
          )}
          <button
            className="btn primary"
            disabled={envoi || (!!place && (!nom.trim() || !placeLa))}
            onClick={enregistrer}
          >
            {envoi ? "Enregistrement…" : creation ? "Créer l'ambiance" : `Enregistrer ${titre}`}
          </button>
        </div>
      </div>

      {aSupprimer && (
        <Question
          titre={`Supprimer ${titre} ?`}
          texte="La tuile disparaît, et sa scène avec. Rien ne permet de la retrouver ensuite."
          oui="Supprimer"
          surOui={supprimer}
          surNon={() => setASupprimer(false)}
        />
      )}
    </>
  );
}
