// Les briques communes aux quatre écrans. Aucune ne parle au Pi.
import {
  useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { tap } from "./native";

export function Etiquette({ children }: { children: ReactNode }) {
  return <p className="label">{children}</p>;
}

export function LigneEtat({ fort, children }: { fort: ReactNode; children?: ReactNode }) {
  return (
    <p className="status-line">
      <b>{fort}</b>
      {children}
    </p>
  );
}

export function Carte({
  lit,
  faute,
  style,
  children,
}: {
  lit?: boolean;
  faute?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`card${lit ? " lit" : ""}${faute ? " fault shake" : ""}`} style={style}>
      {children}
    </div>
  );
}

// Le refus de Home Assistant, sur la carte de l'entité qui a refusé.
export function NoteFaute({ entite, message }: { entite: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="fault-note show" role="alert">
      <span>{message}</span>
      <code>{entite}</code>
    </p>
  );
}

export function Pastille({ etat = "ok", children }: { etat?: "ok" | "todo" | "miss"; children: ReactNode }) {
  return <span className={`pill${etat === "ok" ? "" : " " + etat}`}>{children}</span>;
}

export function Interrupteur({ on, label, onClick, disabled }: {
  on: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="sw"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

// Un curseur dont la valeur s'affiche au geste et ne part au Pi qu'au lâcher.
// Après l'envoi, la valeur locale reste affichée jusqu'à ce que l'écho la
// rattrape — sinon le curseur saute en arrière entre l'ordre et la réponse.
export function Curseur({
  id,
  label,
  min,
  max,
  step = 1,
  valeur,
  format = (v) => `${Math.round(v)} %`,
  onCommit,
  onApercu,
  className,
  style,
  disabled,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  valeur: number;
  format?: (v: number) => string;
  onCommit: (v: number) => void;
  onApercu?: (v: number) => void;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const [locale, setLocale] = useState<number | null>(null);
  useEffect(() => setLocale(null), [valeur]);
  const v = locale ?? valeur;
  const commit = () => {
    if (locale !== null) onCommit(locale);
  };
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(v)}</output>
      </div>
      <input
        id={id}
        type="range"
        className={className}
        style={style}
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          setLocale(n);
          onApercu?.(n);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}

// Les quatre barres qui bougent quand ça joue.
export function Barres() {
  return (
    <span className="bars" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

// L'appui long : une demi-seconde sans bouger, et `surLong` part — le clic
// qui suit le lâcher est alors avalé, pour qu'ouvrir un réglage ne lance pas
// en plus l'ambiance. Le clic droit, et la touche menu du clavier, y mènent
// aussi : le geste n'est pas réservé au doigt. Sans `surLong`, c'est un
// bouton ordinaire.
export function useAppuiLong(
  surLong: (() => void) | undefined,
  surClic: (ev: MouseEvent<HTMLElement>) => void,
  delai = 500,
) {
  const minuterie = useRef<number | null>(null);
  const parti = useRef(false);
  const depart = useRef<[number, number] | null>(null);
  const arreter = () => {
    if (minuterie.current !== null) window.clearTimeout(minuterie.current);
    minuterie.current = null;
  };
  useEffect(() => arreter, []);
  const lancer = () => {
    arreter();
    parti.current = true;
    tap();
    surLong?.();
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      parti.current = false;
      if (!surLong || e.button !== 0) return;
      depart.current = [e.clientX, e.clientY];
      arreter();
      minuterie.current = window.setTimeout(lancer, delai);
    },
    // Un doigt qui glisse fait défiler l'écran : ce n'est plus un appui.
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = depart.current;
      if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 10) arreter();
    },
    onPointerUp: arreter,
    onPointerCancel: arreter,
    onPointerLeave: arreter,
    onKeyDown: () => {
      parti.current = false;
    },
    // Android déclenche aussi le menu contextuel au doigt : celui qui arrive
    // après la minuterie ne relance rien.
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      if (!surLong) return;
      e.preventDefault();
      if (!parti.current) lancer();
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (parti.current) {
        parti.current = false;
        return;
      }
      surClic(e);
    },
  };
}

// Une question fermée, en feuille au bas de l'écran. Échap, le voile ou
// « Non » referment ; le focus va d'emblée sur « Oui ».
//
// Elle s'ouvre souvent sous un doigt encore posé — celui de l'appui long.
// Le lâcher ne doit rien toucher : un clic ne compte que s'il a commencé
// dans la feuille, ou au clavier (detail à 0).
export function Question({ titre, texte, oui = "Oui", non = "Non", surOui, surNon }: {
  titre: string;
  texte?: string;
  oui?: string;
  non?: string;
  surOui: () => void;
  surNon: () => void;
}) {
  const fermer = useRef(surNon);
  fermer.current = surNon;
  const touchee = useRef(false);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer.current();
    };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, []);
  const voulu = (e: MouseEvent) => touchee.current || e.detail === 0;
  return createPortal(
    <div className="voile" onPointerDown={() => (touchee.current = true)} onClick={(e) => voulu(e) && surNon()}>
      <div
        className="feuille"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="question-titre"
        aria-describedby={texte ? "question-texte" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="question-titre" className="feuille-titre">{titre}</p>
        {texte && <p id="question-texte" className="feuille-texte">{texte}</p>}
        <div className="btn-row">
          <button className="btn" onClick={(e) => voulu(e) && surNon()}>{non}</button>
          <button className="btn primary" autoFocus onClick={(e) => voulu(e) && surOui()}>{oui}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Les playlists dans un <select>, en deux groupes : celles de la table des
// ambiances, puis les épinglées. Toujours sous leur nom affiché.
export function OptionsPlaylists({ playlists }: {
  playlists: { valeur: string; nom: string; epinglee: boolean }[];
}) {
  const table = playlists.filter((p) => !p.epinglee);
  const epinglees = playlists.filter((p) => p.epinglee);
  return (
    <>
      {table.length > 0 && (
        <optgroup label="Des ambiances">
          {table.map((p) => <option key={p.valeur} value={p.valeur}>{p.nom}</option>)}
        </optgroup>
      )}
      {epinglees.length > 0 && (
        <optgroup label="Épinglées dans Écoute">
          {epinglees.map((p) => <option key={p.valeur} value={p.valeur}>{p.nom}</option>)}
        </optgroup>
      )}
    </>
  );
}
