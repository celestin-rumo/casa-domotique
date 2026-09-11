import { useMemo, useState } from "react";
import { useMaison } from "../maison";
import {
  PLAYER, PLAYERS, PLAYLIST_COURANTE, PLAYLIST_SELECT, PLAYLISTS_EPINGLEES, PLAYLISTS_NOMS,
} from "../config";
import { mediaPlayPause, mediaNext, joinPlayers, unjoinPlayer, setVolume, playPlaylist } from "../ha";
import {
  ecrireNoms, lireEpingles, lireNoms, nettoyerNom, numeroDe, useBibliotheque, usePlaylists, type Playlist,
} from "../bibliotheque";
import { useTexte } from "../useTexte";
import { Barres, Carte, Curseur, Etiquette, LigneEtat, NoteFaute, useAppuiLong } from "../ui";

export function Ecoute() {
  const { entities, fautes, agir } = useMaison();
  const chef = entities[PLAYER];
  const joue = chef?.state === "playing";
  // group_members liste le groupe, chef compris ; seul, il ne liste que lui.
  const groupe: string[] = chef?.attributes.group_members ?? (chef ? [PLAYER] : []);
  const ecoutent = PLAYERS.filter((p) => groupe.includes(p.id));
  const { playlists, erreur } = usePlaylists();

  // Ce qui joue, tel que script.play_playlist l'a noté. L'enceinte ne dit que
  // le morceau : sans cet écho, une épinglée lancée laissait « Détente »
  // affichée en lecture. Un Pi qui n'a pas encore ce réglage retombe sur
  // l'ancien écho, qui ne connaît que les noms de la table.
  const suivi = entities[PLAYLIST_COURANTE];
  const courante = suivi ? suivi.state : entities[PLAYLIST_SELECT]?.state;

  const [aRenommer, setARenommer] = useState<string | null>(null);
  const [nomsBrut, ecrireNomsBrut] = useTexte(PLAYLISTS_NOMS);
  const [trop, setTrop] = useState(false);
  const renommable = !!entities[PLAYLISTS_NOMS];

  // Le nom d'origine, ou un nom vide, efface le nom donné : la ligne
  // retrouve celui de Spotify ou de la table.
  const renommer = (p: Playlist, nouveau: string) => {
    const noms = lireNoms(nomsBrut);
    const nom = nettoyerNom(nouveau);
    if (!nom || nom === p.origine) noms.delete(p.cle);
    else noms.set(p.cle, nom);
    const texte = ecrireNoms(noms);
    // Le plafond d'un input_text : on le dit ici plutôt que de laisser Home
    // Assistant refuser.
    if (texte.length > 255) return setTrop(true);
    setTrop(false);
    setARenommer(null);
    ecrireNomsBrut(texte);
  };

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

      {playlists.length > 0 && (
        <>
          <Etiquette>Playlists</Etiquette>
          {/* Toutes passent par script.play_playlist, épinglées comprises :
              c'est lui qui laisse l'écho de ce qui joue. */}
          <Carte faute={!!fautes[PLAYLIST_SELECT] || !!fautes[PLAYLISTS_NOMS]}>
            {playlists.map((p) =>
              aRenommer === p.cle ? (
                <Renommer
                  key={p.valeur}
                  p={p}
                  surValider={(nom) => renommer(p, nom)}
                  surAnnuler={() => {
                    setARenommer(null);
                    setTrop(false);
                  }}
                />
              ) : (
                <LignePlaylist
                  key={p.valeur}
                  p={p}
                  active={courante === p.valeur}
                  joue={joue}
                  disabled={!chef}
                  surJouer={() => agir(PLAYLIST_SELECT, () => playPlaylist(p.valeur, PLAYER))}
                  surRenommer={renommable ? () => setARenommer(p.cle) : undefined}
                />
              ),
            )}
            <NoteFaute entite={PLAYLIST_SELECT} message={fautes[PLAYLIST_SELECT]} />
            <NoteFaute
              entite={PLAYLISTS_NOMS}
              message={fautes[PLAYLISTS_NOMS] ?? (trop ? "plus de place pour les noms : raccourcis-en un, ou rends-lui son nom d'origine" : undefined)}
            />
            <NoteFaute entite="music_assistant.get_library" message={erreur ?? undefined} />
          </Carte>
          <p className="astuce">
            {renommable ? "Maintiens une playlist pour la renommer." : "Renommer : packages/playlists.yaml n'est pas à jour sur le Pi."}
          </p>
        </>
      )}

      <Chercher />
    </>
  );
}

// Une playlist : le clic la joue, l'appui long propose de la renommer. Le
// nom d'origine reste lisible sous un nom donné, pour savoir ce qui jouera.
function LignePlaylist({ p, active, joue, disabled, surJouer, surRenommer }: {
  p: Playlist;
  active: boolean;
  joue: boolean;
  disabled: boolean;
  surJouer: () => void;
  surRenommer?: () => void;
}) {
  const appui = useAppuiLong(surRenommer, surJouer);
  const quoi = active && joue ? "en lecture" : active ? "dernière lancée" : p.epinglee ? "épinglée" : "des ambiances";
  return (
    <button className="prow" aria-pressed={active} disabled={disabled} {...appui}>
      <span className="prow-text">
        <span className="prow-name">{p.nom}</span>
        <span className="prow-sub">{quoi}{p.nom !== p.origine ? ` · ${p.origine}` : ""}</span>
      </span>
      {active && joue && <Barres />}
    </button>
  );
}

function Renommer({ p, surValider, surAnnuler }: {
  p: Playlist;
  surValider: (nom: string) => void;
  surAnnuler: () => void;
}) {
  const [texte, setTexte] = useState(p.nom);
  return (
    <div className="prow-edit">
      <input
        className="recherche"
        value={texte}
        autoFocus
        maxLength={40}
        aria-label={`Nouveau nom pour ${p.origine}`}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") surValider(texte);
          if (e.key === "Escape") surAnnuler();
        }}
      />
      <span className="row-meta">nom d'origine : {p.origine}</span>
      <div className="btn-row">
        <button className="btn" onClick={surAnnuler}>Annuler</button>
        {p.nom !== p.origine && <button className="btn" onClick={() => surValider("")}>Nom d'origine</button>}
        <button className="btn primary" onClick={() => surValider(texte)}>Renommer</button>
      </div>
    </div>
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
