// Les briques communes aux quatre écrans. Aucune ne parle au Pi.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

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
  format = (v) => `${Math.round(v)} %`,
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
