import { useEffect, useState } from "react";
import type { HassEntities } from "home-assistant-js-websocket";
import { onEntities, activateScene, setVolume, toggleLight, playPlaylist } from "./ha";
import { MOODS, PLAYER, LIGHTS, PLAYLIST_SELECT } from "./config";
import { setupNative, tap } from "./native";

export default function App() {
  const [entities, setEntities] = useState<HassEntities>({});
  const [status, setStatus] = useState<"connexion" | "ok" | "erreur">("connexion");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setupNative();
    let unsub: (() => void) | undefined;
    onEntities((e) => {
      setEntities(e);
      setStatus("ok");
    })
      .then((u) => (unsub = u))
      .catch(() => setStatus("erreur"));
    return () => unsub?.();
  }, []);

  const player = entities[PLAYER];
  const volume = player?.attributes.volume_level ?? 0;

  // Les options du helper : la liste se modifie sur le Pi, pas dans ce fichier.
  const select = entities[PLAYLIST_SELECT];
  const playlists: string[] = select?.attributes.options ?? [];

  async function mood(id: string) {
    tap();
    setActive(id);
    await activateScene(id);
  }

  return (
    <main>
      <header>
        <h1>Moods</h1>
        <span className={`dot ${status}`} aria-label={status} />
      </header>

      {status === "erreur" && (
        <p className="error">
          Impossible de joindre Home Assistant. Vérifiez l'URL et le token dans .env.
        </p>
      )}

      <section className="moods">
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={active === m.id ? "on" : ""}
            style={{ "--hue": m.hue } as React.CSSProperties}
            onClick={() => mood(m.id)}
          >
            {m.label}
          </button>
        ))}
      </section>

      <section className="volume">
        <label htmlFor="vol">
          {player?.attributes.media_title ?? player?.attributes.friendly_name ?? "Enceinte"}
        </label>
        <input
          id="vol"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          onChange={(e) => setVolume(PLAYER, Number(e.target.value))}
        />
      </section>

      {playlists.length > 0 && (
        <section className="playlists">
          {playlists.map((name) => (
            <button
              key={name}
              className={select?.state === name ? "on" : ""}
              onClick={() => {
                tap();
                playPlaylist(name, PLAYER);
              }}
            >
              {name}
            </button>
          ))}
        </section>
      )}

      <section className="lights">
        {LIGHTS.map((id) => {
          const l = entities[id];
          const on = l?.state === "on";
          return (
            <button key={id} className={on ? "on" : ""} onClick={() => toggleLight(id)}>
              {l?.attributes.friendly_name ?? id}
            </button>
          );
        })}
      </section>
    </main>
  );
}
