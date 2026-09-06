import { useEffect, useState } from "react";
import type { HassEntities } from "home-assistant-js-websocket";
import { onEntities, activateScene, setVolume, toggleLight } from "./ha";
import { MOODS, PLAYER, LIGHTS } from "./config";
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
