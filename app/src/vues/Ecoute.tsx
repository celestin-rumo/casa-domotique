import { useState } from "react";
import { useMaison } from "../maison";
import {
  PLAYER, PLAYERS, PLAYLIST_COURANTE, PLAYLIST_SELECT, PLAYLISTS_ADRESSES, PLAYLISTS_EPINGLEES, PLAYLISTS_NOMS,
} from "../config";
import {
  mediaPlayPause, mediaNext, mediaPrevious, joinPlayers, unjoinPlayer, setShuffle, setVolume, playPlaylist,
} from "../ha";
import {
  ecrireAdresses, ecrireNoms, lireAdresses, lireEpingles, lireNoms, nettoyerNom, numeroDe, usePlaylists, type Playlist,
} from "../bibliotheque";
import { useTexte } from "../useTexte";
import { plafond } from "../ambiances";
import { Barres, Carte, Curseur, Etiquette, Interrupteur, LigneEtat, NoteFaute, useAppuiLong } from "../ui";
import { RecherchePlaylist } from "./Recherche";

// La pièce où partent les playlists, d'une visite à l'autre. Le stockage
// peut manquer : on retombe alors sur la chambre.
const CLE_ENCEINTE = "casa.ecoute.enceinte";
function lireEnceinte(): string {
  try {
    const v = localStorage.getItem(CLE_ENCEINTE);
    if (v && PLAYERS.some((p) => p.id === v)) return v;
  } catch { /* rien à retenir */ }
  return PLAYER;
}

// Deux WiiM depuis le déménagement de novembre 2026, une par pièce, et une
// carte par pièce : ce qu'elle joue, de quoi la piloter, son volume. Deux
// façons de les écouter : dissociées, chacune sa musique ; ou synchronisées,
// en groupe Music Assistant — une seule carte, la même playlist partout, un
// volume par pièce.
//
// group_members liste le groupe, chef en tête. Seule, la WiiM le donne VIDE,
// et non absent — constaté sur le Pi le 11 septembre 2026. Un groupe, c'est
// donc une enceinte dont la liste a plus d'un membre ; son premier membre
// est le chef, celui à qui l'on parle.
export function Ecoute() {
  const { entities, fautes, agir } = useMaison();
  const [choisie, setChoisie] = useState(lireEnceinte);
  const choisir = (id: string) => {
    setChoisie(id);
    try {
      localStorage.setItem(CLE_ENCEINTE, id);
    } catch { /* tant pis */ }
  };
  const groupeDe = (id: string): string[] => entities[id]?.attributes.group_members ?? [];
  const meneur = PLAYERS.map((p) => groupeDe(p.id)).find((m) => m.length > 1)?.[0] ?? null;
  const ensemble = !!meneur && PLAYERS.some((p) => p.id === meneur);
  const membres = ensemble ? groupeDe(meneur!) : [];
  // Où partent les playlists : le chef du groupe, sinon la pièce choisie.
  const pilote = ensemble ? meneur! : choisie;
  const chef = entities[pilote];
  const joue = chef?.state === "playing";
  const presentes = PLAYERS.filter((p) => entities[p.id]);
  const nomDe = (id: string) => PLAYERS.find((p) => p.id === id)?.label ?? id;
  const { playlists, erreur } = usePlaylists();
  const cap = plafond(entities);

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
  const [adressesBrut, ecrireAdressesBrut] = useTexte(PLAYLISTS_ADRESSES);
  const [tropAdresses, setTropAdresses] = useState(false);
  const reassignable = !!entities[PLAYLISTS_ADRESSES];

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

  // Ce que joue un nom de la table : un numéro de la bibliothèque, ou rien
  // pour retrouver l'adresse de scripts.yaml. Les ambiances, le réveil et la
  // voix appellent le nom : ils suivent sans qu'on touche à leurs réglages.
  const reassigner = (p: Playlist, numero: string | null) => {
    const adresses = lireAdresses(adressesBrut);
    if (numero) adresses.set(p.cle, numero);
    else adresses.delete(p.cle);
    const texte = ecrireAdresses(adresses);
    if (texte.length > 255) return setTropAdresses(true);
    setTropAdresses(false);
    setARenommer(null);
    ecrireAdressesBrut(texte);
  };

  return (
    <>
      <LigneEtat
        fort={presentes.length === 0 ? "Aucune enceinte" : ensemble ? membres.map(nomDe).join(" + ") : `${presentes.length} pièces`}
      >
        <span>· {ensemble ? "synchronisées" : "chacune sa musique"}</span>
      </LigneEtat>

      <Carte faute={!!fautes.groupe}>
        <div className="row">
          <div>
            <div className="row-name">Synchroniser les pièces</div>
            <div className="row-meta">
              {ensemble
                ? `même playlist partout · ${nomDe(meneur!)} mène`
                : "chaque pièce joue sa musique"}
            </div>
          </div>
          <Interrupteur
            on={ensemble}
            label="Synchroniser la musique des pièces"
            disabled={presentes.length < 2}
            onClick={() =>
              agir("groupe", async () => {
                if (ensemble) {
                  for (const m of membres) if (m !== meneur) await unjoinPlayer(m);
                } else {
                  // Celle qui joue entraîne les autres : on synchronise sur
                  // ce qu'on entend déjà, pas sur le silence de l'autre pièce.
                  const chefGroupe = presentes.find((p) => entities[p.id]?.state === "playing")?.id ?? choisie;
                  await joinPlayers(chefGroupe, presentes.map((p) => p.id).filter((id) => id !== chefGroupe));
                }
              })
            }
          />
        </div>
        <NoteFaute entite="media_player.join" message={fautes.groupe} />
      </Carte>

      {ensemble ? (
        <CarteLecture ids={membres.filter((id) => PLAYERS.some((p) => p.id === id))} cap={cap} />
      ) : (
        PLAYERS.map((p) => <CarteLecture key={p.id} ids={[p.id]} cap={cap} />)
      )}

      {playlists.length > 0 && (
        <>
          <Etiquette>Playlists</Etiquette>
          {/* Où elles partent. Synchronisées, partout : il n'y a rien à
              choisir. */}
          {ensemble ? (
            <p className="astuce">Elles jouent dans {membres.map(nomDe).join(" et ")}.</p>
          ) : (
            <div className="seg" role="tablist" aria-label="Jouer les playlists sur">
              {PLAYERS.map((p) => (
                <button
                  key={p.id}
                  className="seg-b"
                  role="tab"
                  aria-selected={choisie === p.id}
                  disabled={!entities[p.id]}
                  onClick={() => choisir(p.id)}
                >
                  Jouer sur {p.label}
                </button>
              ))}
            </div>
          )}
          {/* Toutes passent par script.play_playlist, épinglées comprises :
              c'est lui qui laisse l'écho de ce qui joue. */}
          <Carte faute={!!fautes[PLAYLIST_SELECT] || !!fautes[PLAYLISTS_NOMS] || !!fautes[PLAYLISTS_ADRESSES]}>
            {playlists.map((p) =>
              aRenommer === p.cle ? (
                <Modifier
                  key={p.valeur}
                  p={p}
                  reassignable={reassignable && !p.epinglee}
                  surRenommer={(nom) => renommer(p, nom)}
                  surReassigner={(numero) => reassigner(p, numero)}
                  surAnnuler={() => {
                    setARenommer(null);
                    setTrop(false);
                    setTropAdresses(false);
                  }}
                />
              ) : (
                <LignePlaylist
                  key={p.valeur}
                  p={p}
                  active={courante === p.valeur}
                  joue={joue}
                  disabled={!chef}
                  surJouer={() => agir(PLAYLIST_SELECT, () => playPlaylist(p.valeur, pilote))}
                  surRenommer={renommable ? () => setARenommer(p.cle) : undefined}
                />
              ),
            )}
            <NoteFaute entite={PLAYLIST_SELECT} message={fautes[PLAYLIST_SELECT]} />
            <NoteFaute
              entite={PLAYLISTS_NOMS}
              message={fautes[PLAYLISTS_NOMS] ?? (trop ? "plus de place pour les noms : raccourcis-en un, ou rends-lui son nom d'origine" : undefined)}
            />
            <NoteFaute
              entite={PLAYLISTS_ADRESSES}
              message={fautes[PLAYLISTS_ADRESSES] ?? (tropAdresses ? "plus de place : rends sa playlist d'origine à un autre nom d'abord" : undefined)}
            />
            <NoteFaute entite="music_assistant.get_library" message={erreur ?? undefined} />
          </Carte>
          <p className="astuce">
            {!renommable
              ? "Renommer : packages/playlists.yaml n'est pas à jour sur le Pi."
              : reassignable
                ? "Maintiens une playlist pour la renommer, ou changer ce que joue un nom des ambiances."
                : "Maintiens une playlist pour la renommer."}
          </p>
        </>
      )}

      <Chercher />
    </>
  );
}

// Une pièce — ou toutes, synchronisées — : ce qui joue, de quoi le piloter,
// l'aléatoire, et un volume par enceinte. Les commandes vont au premier id,
// le chef du groupe : c'est à lui que Music Assistant obéit.
function CarteLecture({ ids, cap }: { ids: string[]; cap: number }) {
  const { entities, fautes, agir } = useMaison();
  const chef = ids[0];
  const e = entities[chef];
  const joue = e?.state === "playing";
  const aleatoire = e?.attributes.shuffle === true;
  const nomDe = (id: string) => PLAYERS.find((p) => p.id === id)?.label ?? id;
  const titre = ids.map(nomDe).join(" + ");
  // Le titre d'un morceau en pause reste utile ; celui d'une enceinte à
  // l'arrêt depuis des heures ne l'est plus.
  const actif = joue || e?.state === "paused";
  const morceau = actif ? e?.attributes.media_title : null;
  const artiste = actif ? e?.attributes.media_artist : null;
  const etat = !e ? "absente" : joue ? "en lecture" : e.state === "paused" ? "en pause" : "à l'arrêt";

  return (
    <Carte lit={joue} faute={ids.some((id) => !!fautes[id])}>
      <div className="enceinte-tete">
        <div className="row-name">{titre}</div>
        <span className="row-meta">{etat}</span>
      </div>
      <div className={`np${joue ? " playing" : ""}`}>
        <div className="art">
          <Barres />
        </div>
        <div className="np-text">
          <div className="np-title">{morceau ?? (e ? "Rien en lecture" : "Enceinte absente")}</div>
          <div className="np-sub">{artiste ?? (e ? "choisis une playlist plus bas" : chef)}</div>
        </div>
      </div>
      <div className="transport">
        <button className="tbtn" aria-label={`Piste précédente · ${titre}`} disabled={!e}
                onClick={() => agir(chef, () => mediaPrevious(chef))}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5" y="5" width="3" height="14" rx="1.2" /><path d="M19 5.5v13L9 12l10-6.5Z" />
          </svg>
        </button>
        <button className="tbtn primary" aria-label={`${joue ? "Pause" : "Lecture"} · ${titre}`} disabled={!e}
                onClick={() => agir(chef, () => mediaPlayPause(chef))}>
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
        <button className="tbtn" aria-label={`Piste suivante · ${titre}`} disabled={!e}
                onClick={() => agir(chef, () => mediaNext(chef))}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M5 5.5v13l10-6.5L5 5.5Z" /><rect x="16" y="5" width="3" height="14" rx="1.2" />
          </svg>
        </button>
        {/* L'état vient de l'enceinte (attribut shuffle), pas du geste. */}
        <span className="transport-fin">
          <span className="row-meta">aléatoire</span>
          <Interrupteur
            on={aleatoire}
            label={`Lecture aléatoire · ${titre}`}
            disabled={!e}
            onClick={() => agir(chef, () => setShuffle(chef, !aleatoire))}
          />
        </span>
      </div>
      {/* Un volume par enceinte, même synchronisées : la même musique ne se
          veut pas aussi fort partout. Le curseur s'arrête au plafond
          (Réglages → Son). */}
      {ids.map((id) => (
        <Curseur
          key={id}
          id={`vol-${id.replace(".", "-")}`}
          label={ids.length > 1 ? `Volume · ${nomDe(id)}` : "Volume"}
          min={0}
          max={cap}
          disabled={!entities[id]}
          valeur={Math.min(cap, Math.round((entities[id]?.attributes.volume_level ?? 0) * 100))}
          format={(v) => `${Math.round(v)} %${cap < 100 ? ` / ${cap}` : ""}`}
          onCommit={(pct) => agir(id, () => setVolume(id, pct / 100))}
        />
      ))}
      {ids.map((id) => (
        <NoteFaute key={id} entite={id} message={fautes[id] ?? (entities[id] ? undefined : "l'entité n'existe pas sur le Pi")} />
      ))}
    </Carte>
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
        <span className="prow-sub">
          {quoi}{p.nom !== p.origine ? ` · ${p.origine}` : ""}{p.joue ? ` · joue ${p.joue}` : ""}
        </span>
      </span>
      {active && joue && <Barres />}
    </button>
  );
}

// L'appui long sur une playlist : la renommer, et, pour un nom de la table,
// changer ce qu'il joue. Le nom d'origine reste affiché, pour savoir de quoi
// on parle.
function Modifier({ p, reassignable, surRenommer, surReassigner, surAnnuler }: {
  p: Playlist;
  reassignable: boolean;
  surRenommer: (nom: string) => void;
  surReassigner: (numero: string | null) => void;
  surAnnuler: () => void;
}) {
  const [texte, setTexte] = useState(p.nom);
  const [chercher, setChercher] = useState(false);
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
          if (e.key === "Enter") surRenommer(texte);
          if (e.key === "Escape") surAnnuler();
        }}
      />
      <span className="row-meta">nom d'origine : {p.origine}</span>
      <div className="btn-row">
        <button className="btn" onClick={surAnnuler}>Annuler</button>
        {p.nom !== p.origine && <button className="btn" onClick={() => surRenommer("")}>Nom d'origine</button>}
        <button className="btn primary" onClick={() => surRenommer(texte)}>Renommer</button>
      </div>

      {reassignable && (
        <>
          <span className="row-meta">
            {p.nom} joue {p.joue ?? "sa playlist d'origine"} · les ambiances et le réveil qui l'utilisent suivent
          </span>
          <div className="btn-row">
            {p.joue && <button className="btn" onClick={() => surReassigner(null)}>Playlist d'origine</button>}
            <button className="btn" aria-expanded={chercher} onClick={() => setChercher(!chercher)}>
              Changer la playlist
            </button>
          </div>
          {chercher && (
            <RecherchePlaylist
              autoFocus
              active={(b) => !!p.adresse && numeroDe(b.uri) === p.adresse}
              sousTitre={(_, a) => (a ? `ce que joue ${p.nom}` : `toucher pour que ${p.nom} la joue`)}
              surChoisir={(b) => {
                const numero = numeroDe(b.uri);
                if (numero) surReassigner(numero);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// Ajouter une playlist : chercher dans la bibliothèque de Music Assistant et
// épingler.
function Chercher() {
  const { entities, fautes } = useMaison();
  const [ouvert, setOuvert] = useState(false);
  const [brut, ecrire] = useTexte(PLAYLISTS_EPINGLEES);
  const numeros = lireEpingles(brut);
  const present = !!entities[PLAYLISTS_EPINGLEES];
  const [trop, setTrop] = useState(false);

  const basculer = (numero: string) => {
    const suivant = (numeros.includes(numero) ? numeros.filter((n) => n !== numero) : [...numeros, numero]).join(",");
    // Le plafond d'un input_text : on le dit ici plutôt que de laisser Home
    // Assistant refuser.
    if (suivant.length > 255) return setTrop(true);
    setTrop(false);
    ecrire(suivant);
  };
  const epinglee = (uri: string) => numeros.includes(numeroDe(uri) ?? "");

  return (
    <>
      <button className="adv-toggle" aria-expanded={ouvert} aria-controls="chercher-playlist" onClick={() => setOuvert(!ouvert)}>
        <span>Ajouter une playlist</span>
        <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {ouvert && (
        <Carte faute={!!fautes[PLAYLISTS_EPINGLEES]}>
          <div id="chercher-playlist" className="sous">
            {!present && <p className="row-meta">packages/playlists.yaml n'est pas chargé sur le Pi : rien ne peut être épinglé.</p>}
            <NoteFaute entite={PLAYLISTS_EPINGLEES} message={fautes[PLAYLISTS_EPINGLEES] ?? (trop ? "plus de place : retire une épingle d'abord" : undefined)} />
            <RecherchePlaylist
              disabled={!present}
              active={(p) => epinglee(p.uri)}
              sousTitre={(_, a) => (a ? "épinglée · toucher pour retirer" : "toucher pour épingler")}
              surChoisir={(p) => {
                const numero = numeroDe(p.uri);
                if (numero) basculer(numero);
              }}
            />
          </div>
        </Carte>
      )}
    </>
  );
}
