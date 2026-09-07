import { useMaison } from "../maison";
import { PLAYER, PLAYERS, PLAYLIST_SELECT } from "../config";
import { mediaPlayPause, mediaNext, joinPlayers, unjoinPlayer, setVolume, playPlaylist } from "../ha";
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
                    <span className="prow-sub">{en ? "en lecture" : select?.state === nom ? "dernière choisie" : " "}</span>
                  </span>
                  <Barres />
                </button>
              );
            })}
            <NoteFaute entite={PLAYLIST_SELECT} message={fautes[PLAYLIST_SELECT]} />
          </Carte>
        </>
      )}
    </>
  );
}
