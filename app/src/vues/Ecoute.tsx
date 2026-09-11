import { useMemo, useState } from "react";
import { useMaison } from "../maison";
import { PLAYER, PLAYERS, PLAYLIST_SELECT, PLAYLISTS_EPINGLEES } from "../config";
import { mediaPlayPause, mediaNext, joinPlayers, unjoinPlayer, setVolume, playPlaylist, playUri } from "../ha";
import { lireEpingles, numeroDe, useBibliotheque, useEpingles } from "../bibliotheque";
import { useTexte } from "../useTexte";
import { Barres, Carte, Curseur, Etiquette, LigneEtat, NoteFaute } from "../ui";

export function Ecoute() {
  const { entities, fautes, agir } = useMaison();
  const chef = entities[PLAYER];
  const joue = chef?.state === "playing";
  // group_members liste le groupe, chef compris ; seul, il ne liste que lui.
  const groupe: string[] = chef?.attributes.group_members ?? (chef ? [PLAYER] : []);
  const ecoutent = PLAYERS.filter((p) => groupe.includes(p.id));
  const select = entities[PLAYLIST_SELECT];
  const playlists: string[] = select?.attributes.options ?? [];
  const { epingles, erreur } = useEpingles();

  return (
    <>
      <LigneEtat
        fort={!chef ? "Aucune enceinte" : ecoutent.length <= 1 ? "1 enceinte" : `${ecoutent.length} enceintes groupées`}
      >
        <span>· Music Assistant</span>
      </LigneEtat>

      <Carte faute={!!fautes[PLAYER]}>
        <div className={`np${joue ? " playing" : ""}`}>
          <div className="art">
            <Barres />
          </div>
          <div className="np-text">
            <div className="np-title">{chef?.attributes.media_title ?? (chef ? "Rien en lecture" : "Enceinte absente")}</div>
            <div className="np-sub">
              {chef?.attributes.media_artist ?? chef?.attributes.friendly_name ?? PLAYER}
            </div>
          </div>
        </div>
        <NoteFaute entite={PLAYER} message={fautes[PLAYER] ?? (chef ? undefined : "l'entité n'existe pas sur le Pi")} />
        <div className="transport">
          <button className="tbtn primary" aria-label={joue ? "Pause" : "Lecture"} disabled={!chef}
                  onClick={() => agir(PLAYER, () => mediaPlayPause(PLAYER))}>
            {joue ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5.2v13.6L19 12 7 5.2Z" />
              </svg>
            )}
          </button>
          <button className="tbtn" aria-label="Piste suivante" disabled={!chef}
                  onClick={() => agir(PLAYER, () => mediaNext(PLAYER))}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M5 5.5v13l10-6.5L5 5.5Z" /><rect x="16" y="5" width="3" height="14" rx="1.2" />
            </svg>
          </button>
        </div>
      </Carte>

      <Etiquette>Pièces qui écoutent</Etiquette>
      <div className="chips">
        {PLAYERS.map((p) => {
          const present = !!entities[p.id];
          const dedans = groupe.includes(p.id);
          // Le chef reste : c'est lui qu'on entend, on retire les autres.
          const fige = p.id === PLAYER;
          return (
            <button
              key={p.id}
              className="chip"
              aria-pressed={dedans}
              disabled={!present || !chef || fige}
              title={!present ? `${p.id} absente` : fige ? "l'enceinte de référence" : undefined}
              onClick={() => agir(p.id, () => (dedans ? unjoinPlayer(p.id) : joinPlayers(PLAYER, [p.id])))}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {ecoutent.length > 0 && (
        <Carte>
          <div className="vol-rows">
            {ecoutent.map((p) => (
              <div className="vol-row expand" key={p.id}>
                <Curseur
                  id={`vol-${p.id.replace(".", "-")}`}
                  label={p.label}
                  min={0}
                  max={100}
                  valeur={Math.round((entities[p.id]?.attributes.volume_level ?? 0) * 100)}
                  onCommit={(pct) => agir(p.id, () => setVolume(p.id, pct / 100))}
                />
                <NoteFaute entite={p.id} message={p.id === PLAYER ? undefined : fautes[p.id]} />
              </div>
            ))}
          </div>
        </Carte>
      )}

      {(playlists.length > 0 || epingles.length > 0) && (
        <>
          <Etiquette>Playlists</Etiquette>
          <Carte faute={!!fautes[PLAYLIST_SELECT]}>
            {playlists.map((nom) => {
              const en = select?.state === nom && joue;
              return (
                <button
                  key={nom}
                  className="prow"
                  aria-pressed={select?.state === nom}
                  disabled={!chef}
                  onClick={() => agir(PLAYLIST_SELECT, () => playPlaylist(nom, PLAYER))}
                >
                  <span className="prow-text">
                    <span className="prow-name">{nom}</span>
                    <span className="prow-sub">{en ? "en lecture" : select?.state === nom ? "dernière choisie" : "des ambiances"}</span>
                  </span>
                  <Barres />
                </button>
              );
            })}
            {/* Les épinglées se jouent par leur adresse, sans écho : aucune ne
                s'allume comme « dernière choisie », et un refus s'affiche
                sur la carte de l'enceinte, celle qui a refusé. */}
            {epingles.map((p) => (
              <button
                key={p.uri}
                className="prow"
                disabled={!chef}
                onClick={() => agir(PLAYER, () => playUri(p.uri, PLAYER))}
              >
                <span className="prow-text">
                  <span className="prow-name">{p.name}</span>
                  <span className="prow-sub">épinglée</span>
                </span>
              </button>
            ))}
            <NoteFaute entite={PLAYLIST_SELECT} message={fautes[PLAYLIST_SELECT]} />
            <NoteFaute entite="music_assistant.get_library" message={erreur ?? undefined} />
          </Carte>
        </>
      )}

      <Chercher />
    </>
  );
}

const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ajouter une playlist : chercher dans la bibliothèque de Music Assistant et
// épingler. La bibliothèque entière n'est demandée qu'à l'ouverture, puis la
// recherche se fait sur le natel, à chaque lettre, sans repasser par le Pi.
function Chercher() {
  const { entities, fautes } = useMaison();
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const { items, erreur } = useBibliotheque(ouvert);
  const [brut, ecrire] = useTexte(PLAYLISTS_EPINGLEES);
  const numeros = lireEpingles(brut);
  const present = !!entities[PLAYLISTS_EPINGLEES];
  const [trop, setTrop] = useState(false);

  const trouvees = useMemo(() => {
    const n = normaliser(q.trim());
    if (!items || n.length < 2) return [];
    return items.filter((p) => normaliser(p.name).includes(n)).slice(0, 20);
  }, [items, q]);

  const basculer = (numero: string) => {
    const suivant = (numeros.includes(numero) ? numeros.filter((n) => n !== numero) : [...numeros, numero]).join(",");
    // Le plafond d'un input_text : on le dit ici plutôt que de laisser Home
    // Assistant refuser.
    if (suivant.length > 255) return setTrop(true);
    setTrop(false);
    ecrire(suivant);
  };

  return (
    <>
      <button className="adv-toggle" aria-expanded={ouvert} aria-controls="chercher-playlist" onClick={() => setOuvert(!ouvert)}>
        <span>Ajouter une playlist</span>
        <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {ouvert && (
        <Carte faute={!!erreur || !!fautes[PLAYLISTS_EPINGLEES]}>
          <div id="chercher-playlist" className="sous">
            {!present && <p className="row-meta">packages/playlists.yaml n'est pas chargé sur le Pi : rien ne peut être épinglé.</p>}
            <input
              type="search"
              className="recherche"
              placeholder="Chercher dans ta bibliothèque…"
              aria-label="Chercher une playlist"
              value={q}
              disabled={!present}
              onChange={(e) => setQ(e.target.value)}
            />
            <NoteFaute entite="music_assistant.get_library" message={erreur ?? undefined} />
            <NoteFaute entite={PLAYLISTS_EPINGLEES} message={fautes[PLAYLISTS_EPINGLEES] ?? (trop ? "plus de place : retire une épingle d'abord" : undefined)} />
            {!items && !erreur && <p className="row-meta">bibliothèque en chargement…</p>}
            {items && q.trim().length < 2 && <p className="row-meta">{items.length} playlists dans ta bibliothèque · deux lettres suffisent</p>}
            {items && q.trim().length >= 2 && trouvees.length === 0 && <p className="row-meta">rien ne correspond</p>}
            {trouvees.map((p) => {
              const numero = numeroDe(p.uri);
              if (!numero) return null;
              const epinglee = numeros.includes(numero);
              return (
                <button key={p.uri} className="prow" aria-pressed={epinglee} disabled={!present} onClick={() => basculer(numero)}>
                  <span className="prow-text">
                    <span className="prow-name">{p.name}</span>
                    <span className="prow-sub">{epinglee ? "épinglée · toucher pour retirer" : "toucher pour épingler"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Carte>
      )}
    </>
  );
}
