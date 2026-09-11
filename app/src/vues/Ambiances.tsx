import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useMaison } from "../maison";
import { useNavigation } from "../navigation";
import { MOODS, MOOD_SELECT, LIGHTS, CIBLES_ENREGISTREMENT } from "../config";
import { enregistrerScene, scenePourLumieres, type EtatLumiere } from "../ha";
import { Carte, Etiquette, LigneEtat, NoteFaute, Question, useAppuiLong } from "../ui";
import { Reveil } from "./Reveil";

type Mood = (typeof MOODS)[number];

const reduit = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Le lavis part du point touché, dans la teinte de l'ambiance, et s'efface.
// Un élément éphémère hors de React : il n'a pas d'état, il a une durée.
function lavis(ev: MouseEvent<HTMLElement>) {
  if (reduit()) return;
  const tuile = ev.currentTarget;
  const r = tuile.getBoundingClientRect();
  const x = ev.clientX ? ev.clientX - r.left : r.width / 2;
  const y = ev.clientY ? ev.clientY - r.top : r.height / 2;
  const portee = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
  const w = document.createElement("span");
  w.className = "wash";
  w.style.left = `${x}px`;
  w.style.top = `${y}px`;
  tuile.appendChild(w);
  const fin = () => w.remove();
  w.animate(
    [
      { transform: "scale(1)", opacity: 0.34 },
      { transform: `scale(${portee / 6})`, opacity: 0 },
    ],
    { duration: 620, easing: "cubic-bezier(.22,1,.36,1)" }
  ).finished.then(fin, fin);
}

function depuis(iso: string | undefined, maintenant: number): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((maintenant - Date.parse(iso)) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `depuis ${min} min`;
  const h = Math.floor(min / 60);
  return `depuis ${h} h${min % 60 ? ` ${min % 60}` : ""}`;
}

export function Ambiances() {
  const { entities, fautes, attente, confirmee, ambiance } = useMaison();
  const { ouvrir } = useNavigation();
  const [aModifier, setAModifier] = useState<Mood | null>(null);
  const select = entities[MOOD_SELECT];
  const courante = select?.state;
  const affichee = attente ?? courante;
  const mood = MOODS.find((m) => m.id === affichee);

  // « depuis 12 min » doit avancer sans qu'on touche à rien.
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fauteAmbiance = MOODS.map((m) => [m.id, fautes[m.id]] as const).find(([, f]) => f);

  return (
    <>
      <LigneEtat fort={mood ? mood.label : "Aucune ambiance"}>
        <span className="tnum">
          {attente ? "envoyé" : mood ? depuis(select?.last_changed, maintenant) : "rien n'a encore été choisi"}
        </span>
      </LigneEtat>

      <div className="moods">
        {MOODS.map((m) => (
          <Tuile
            key={m.id}
            m={m}
            on={affichee === m.id}
            etat={attente === m.id ? " pending" : confirmee === m.id ? " settled" : ""}
            surClic={(ev) => {
              lavis(ev);
              ambiance(m.id);
            }}
            // « Tout éteindre » n'a ni scène ni musique : rien à y modifier.
            surLong={m.scene ? () => setAModifier(m) : undefined}
          />
        ))}
      </div>
      <p className="astuce">Maintiens une ambiance pour la modifier.</p>

      {fauteAmbiance && <NoteFaute entite={fauteAmbiance[0]} message={fauteAmbiance[1]} />}

      {aModifier && (
        <Question
          titre={`Modifier ${aModifier.label} ?`}
          texte={`Les lumières passent sur ${aModifier.label}, et tu règles la pièce en direct. Rien n'est gardé avant « Enregistrer ».`}
          surOui={() => {
            setAModifier(null);
            ouvrir({ type: "ambiance", id: aModifier.id });
          }}
          surNon={() => setAModifier(null)}
        />
      )}

      <Etiquette>Ajuster</Etiquette>
      <Enregistrer entities={entities} />

      <Etiquette>Le matin</Etiquette>
      <Reveil />
    </>
  );
}

// Une tuile : le clic lance l'ambiance, l'appui long propose de la modifier.
function Tuile({ m, on, etat, surClic, surLong }: {
  m: Mood;
  on: boolean;
  etat: string;
  surClic: (ev: MouseEvent<HTMLElement>) => void;
  surLong?: () => void;
}) {
  const appui = useAppuiLong(surLong, surClic);
  return (
    <button
      className={`mood${m.wide ? " wide" : ""}${etat}`}
      style={{ "--hue": m.hue } as CSSProperties}
      aria-pressed={on}
      {...appui}
    >
      <span className="settle" aria-hidden="true" />
      <span className="mood-name">{m.label}</span>
      <span className="mood-what">{m.what}</span>
    </button>
  );
}

// Régler les lampes à la main, puis figer cet état dans une ambiance. Deux
// appuis : le premier arme, le second écrit — un seul suffirait à écraser
// une ambiance par mégarde, et rien ne permettrait de la retrouver.
//
// La liste vient de CIBLES_ENREGISTREMENT : les ambiances qui ont une scène,
// plus l'éclairage « Réveillé » que « Je suis debout » peut allumer. « Tout
// éteindre » n'y est pas : enregistrer une pièce noire n'apprendrait rien.
function Enregistrer({ entities }: { entities: Record<string, EtatLumiere | undefined> }) {
  const [arme, setArme] = useState<string | null>(null);
  const [dit, setDit] = useState<string | null>(null);
  const [rate, setRate] = useState(false);

  const enregistrables = CIBLES_ENREGISTREMENT;
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
    <Carte faute={rate}>
      <div className="row">
        <div>
          <div className="row-name">Enregistrer les lumières</div>
          <div className="row-meta">
            {allumees} allumée{allumees > 1 ? "s" : ""} sur {LIGHTS.length} · devient l'ambiance choisie
          </div>
        </div>
      </div>
      <div className="btn-row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        {enregistrables.map((m) => (
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
        <p className="row-meta" style={{ marginTop: 10 }} role="status">
          {dit}
        </p>
      )}
    </Carte>
  );
}
