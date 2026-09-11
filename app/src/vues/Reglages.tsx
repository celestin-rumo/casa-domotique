import { useEffect, useState } from "react";
import { useMaison } from "../maison";
import { HOTE, enregistrerScene, latence, scenePourLumieres, setNumber } from "../ha";
import {
  LIGHTS, MOODS, PLAYER, PLAYERS, DEVICES, PLAYLIST_SELECT, MOOD_SELECT, REVEIL, REVEILLE, CLIMAT, VOLUME_MAX,
} from "../config";
import { PLACES, listeAmbiances, plafond } from "../ambiances";
import { Curseur, Depliable, Etiquette, LigneEtat, NoteFaute, Pastille } from "../ui";
import { ReglagesReveil } from "./Reveil";

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
  ...MOODS.flatMap((m) => (m.volume ? [{ id: m.volume, role: `Ambiance · volume de ${m.label}` }] : [])),
  ...PLACES.flatMap((p) => [
    { id: p.id, role: `Ambiance ajoutée · place ${p.n}` },
    { id: p.texte, role: `Ambiance ajoutée · ce que la place ${p.n} contient` },
  ]),
  { id: "script.play_playlist", role: "Seule table nom → URI" },
  { id: PLAYLIST_SELECT, role: "Les playlists proposées" },
  { id: MOOD_SELECT, role: "L'ambiance courante" },
  { id: VOLUME_MAX, role: "Son · plafond de la WiiM" },
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

// Tout ce qu'on règle une fois, et pas chaque jour : le lever en détail, le
// plafond du son, l'enregistrement des lumières, puis ce que le Pi dit de la
// liaison et des entités. Chaque section est une carte repliée, qui résume
// son contenu : l'écran entier tient sans défiler, et on n'ouvre que ce
// qu'on vient régler.
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

      {/* L'ancre de la carte du réveil, sur Ambiances. */}
      <section className="groupe" id="reglages-reveil" aria-label="Réglages du réveil">
        <Etiquette>Réveil</Etiquette>
        <ReglagesReveil />
      </section>

      <Etiquette>Son</Etiquette>
      <Plafond />

      <Etiquette>Lumières</Etiquette>
      <Enregistrer />

      <Etiquette>Connexion</Etiquette>
      <Depliable
        id="connexion"
        titre="Home Assistant"
        resume={`${HOTE} · ${TEXTE[liaison].toLowerCase()}${liaison === "ok" && ms !== null ? ` · ${ms} ms` : ""}`}
      >
        <div className="row">
          <div>
            <div className="row-name">Liaison</div>
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
      </Depliable>
      <Depliable
        id="entites"
        titre="Entités"
        resume={absentes === 0 ? "toutes liées" : `${absentes} absente${absentes > 1 ? "s" : ""} sur ${ATTENDUES.length}`}
      >
        {/* Un bloc à part : les lignes ont leur propre filet, sans l'écart
            de la carte entre elles. */}
        <div>
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
        </div>
      </Depliable>
    </>
  );
}

// Le plafond de la WiiM (packages/son.yaml). Rien ne le dépasse : Home
// Assistant y ramène l'enceinte, d'où que vienne le volume. Tout à droite,
// pas de plafond — écrit 0 sur le Pi.
function Plafond() {
  const { entities, fautes, agir } = useMaison();
  const present = !!entities[VOLUME_MAX];
  const cap = plafond(entities);
  const wiim = entities[PLAYER];
  const actuel = Math.round((wiim?.attributes.volume_level ?? 0) * 100);
  const resume = `${!present ? "absent du Pi" : cap < 100 ? `plafond ${cap} %` : "aucun plafond"}${wiim ? ` · en ce moment ${actuel} %` : ""}`;
  return (
    <Depliable id="son-plafond" titre="Volume maximal" resume={resume} faute={!!fautes[VOLUME_MAX]}>
      <Curseur
        id="volume-max"
        label="Plafond"
        min={2}
        max={100}
        valeur={cap}
        format={(v) => (v >= 100 ? "aucun" : `${Math.round(v)} %`)}
        disabled={!present}
        onCommit={(v) => agir(VOLUME_MAX, () => setNumber(VOLUME_MAX, v >= 100 ? 0 : Math.round(v)))}
      />
      <p className="row-meta">
        {present
          ? "Ni les ambiances, ni le réveil, ni Écoute, ni l'app WiiM ne le dépassent. Le volume de chaque ambiance se règle en la maintenant, sur Ambiances."
          : "packages/son.yaml n'est pas encore chargé : Home Assistant doit redémarrer après le git pull."}
      </p>
      <NoteFaute entite={VOLUME_MAX} message={fautes[VOLUME_MAX]} />
    </Depliable>
  );
}

// Régler les lampes à la main, puis figer cet état dans une ambiance. Deux
// appuis : le premier arme, le second écrit — un seul suffirait à écraser
// une ambiance par mégarde, et rien ne permettrait de la retrouver.
//
// La liste : les ambiances qui ont une scène, ajoutées comprises, plus
// l'éclairage « Réveillé » que « Je suis debout » peut allumer. « Tout
// éteindre » n'y est pas : enregistrer une pièce noire n'apprendrait rien.
function Enregistrer() {
  const { entities } = useMaison();
  const [arme, setArme] = useState<string | null>(null);
  const [dit, setDit] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  const cibles = [
    ...listeAmbiances(entities).flatMap((a) => (a.scene ? [{ id: a.id, label: a.label, scene: a.scene }] : [])),
    { id: REVEILLE.id, label: REVEILLE.label, scene: REVEILLE.scene },
  ];
  const allumees = LIGHTS.filter((id) => entities[id]?.state === "on").length;

  async function ecrire(scene: string, nom: string) {
    setArme(null);
    try {
      await enregistrerScene(scene, nom, scenePourLumieres(LIGHTS, entities));
      setRate(false);
      setDit(`${nom} : les lumières actuelles sont enregistrées`);
    } catch (e) {
      setRate(true);
      setDit(e instanceof Error ? e.message : "l'enregistrement a échoué");
    }
  }

  return (
    <Depliable
      id="lumieres-enregistrer"
      titre="Enregistrer les lumières"
      resume={`${allumees} allumée${allumees > 1 ? "s" : ""} sur ${LIGHTS.length} · deviennent l'ambiance choisie`}
      faute={rate}
    >
      <div className="btn-row" style={{ flexWrap: "wrap" }}>
        {cibles.map((m) => (
          <button
            key={m.id}
            className={`btn${arme === m.id ? " primary" : ""}`}
            onClick={() => (arme === m.id ? ecrire(m.scene, m.label) : (setArme(m.id), setDit(null)))}
          >
            {arme === m.id ? `Écraser ${m.label} ?` : m.label}
          </button>
        ))}
      </div>
      {dit && (
        <p className="row-meta" role="status">
          {dit}
        </p>
      )}
    </Depliable>
  );
}
