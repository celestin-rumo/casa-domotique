import { useEffect, useState } from "react";
import { useMaison } from "../maison";
import { HOTE, latence } from "../ha";
import { LIGHTS, MOODS, PLAYERS, DEVICES, PLAYLIST_SELECT, MOOD_SELECT, REVEIL, CLIMAT } from "../config";
import { Carte, Etiquette, LigneEtat, Pastille } from "../ui";

const TEXTE = {
  connexion: "Connexion",
  ok: "Connecté",
  perdu: "Liaison perdue",
  erreur: "Injoignable",
} as const;

// Tout ce que config.ts nomme, avec ce que le Pi en dit. La pastille n'est
// pas écrite à la main : « liée » veut dire que l'entité existe vraiment.
const ATTENDUES: { id: string; role: string }[] = [
  ...LIGHTS.map((id) => ({ id, role: "Lumière" })),
  ...MOODS.map((m) => ({ id: m.id, role: `Ambiance · ${m.label}` })),
  { id: "script.play_playlist", role: "Seule table nom → URI" },
  { id: PLAYLIST_SELECT, role: "Les playlists proposées" },
  { id: MOOD_SELECT, role: "L'ambiance courante" },
  { id: REVEIL.heure, role: "Réveil · l'heure" },
  { id: REVEIL.actif, role: "Réveil · actif" },
  { id: REVEIL.duree, role: "Réveil · durée du lever" },
  { id: REVEIL.script, role: "Réveil · le lever de soleil" },
  { id: REVEIL.stop, role: "Réveil · je suis debout" },
  { id: CLIMAT.temperature, role: "Climat · température de la pièce" },
  { id: CLIMAT.humidite, role: "Climat · humidité de la pièce" },
  { id: CLIMAT.exterieur, role: "Climat · MétéoSuisse" },
  ...PLAYERS.map((p) => ({ id: p.id, role: `Music Assistant · ${p.label}` })),
  ...DEVICES.map((d) => ({ id: d.id, role: d.label })),
];

export function Reglages() {
  const { entities, liaison } = useMaison();
  const [ms, setMs] = useState<number | null>(null);

  // La latence se mesure tant que l'écran est ouvert, et cesse avec lui.
  useEffect(() => {
    let vivant = true;
    const mesurer = () => latence().then((v) => vivant && setMs(v)).catch(() => vivant && setMs(null));
    mesurer();
    const t = setInterval(mesurer, 10_000);
    return () => {
      vivant = false;
      clearInterval(t);
    };
  }, [liaison]);

  const absentes = ATTENDUES.filter((e) => !entities[e.id]).length;

  return (
    <>
      <LigneEtat fort={TEXTE[liaison]}>
        <span className="tnum">{liaison === "ok" && ms !== null ? `WebSocket · ${ms} ms` : ""}</span>
      </LigneEtat>

      <Carte>
        <div className="row">
          <div>
            <div className="row-name">Home Assistant</div>
            <div className="row-meta">{HOTE}</div>
          </div>
          <Pastille etat={liaison === "ok" ? "ok" : liaison === "perdu" ? "todo" : "miss"}>
            {liaison === "ok" ? "en ligne" : liaison === "perdu" ? "reconnexion" : liaison === "erreur" ? "hors ligne" : "…"}
          </Pastille>
        </div>
        <div className="row">
          <div>
            <div className="row-name">Jeton</div>
            <div className="row-meta">longue durée · dans le build</div>
          </div>
          <Pastille etat="todo">privé</Pastille>
        </div>
      </Carte>

      <Etiquette>
        Entités {absentes === 0 ? "· toutes liées" : `· ${absentes} absente${absentes > 1 ? "s" : ""}`}
      </Etiquette>
      <Carte>
        {ATTENDUES.map((e) => {
          const ent = entities[e.id];
          return (
            <div className="ent" key={e.id}>
              <div>
                <code>{e.id}</code>
                <small>{e.role}</small>
              </div>
              {ent ? (
                <Pastille etat={ent.state === "unavailable" ? "miss" : "ok"}>
                  {ent.state === "unavailable" ? "injoignable" : "liée"}
                </Pastille>
              ) : (
                <Pastille etat="miss">absente</Pastille>
              )}
            </div>
          );
        })}
      </Carte>
    </>
  );
}
