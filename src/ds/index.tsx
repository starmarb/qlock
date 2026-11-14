// qlock's design system: the small set of components every page is built from.
// Styles live in styles/components.css; system.html shows every state.

import { useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent, type ButtonHTMLAttributes } from "react";
import katex from "katex";

// ---------------------------------------------------------------------------
// Button

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "quiet";
  busy?: boolean;
}

export function Button({ variant = "primary", busy = false, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`ds-button ds-button--${variant} ${className}`.trim()}
      aria-busy={busy || undefined}
      {...rest}
    >
      <span className="ds-button__spinner" aria-hidden="true" />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tabs: roving tabindex, arrow keys, Home/End, and one sliding indicator.

export interface TabItem<T extends string> { id: T; label: string }

export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, w: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (el) setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  const move = (e: KeyboardEvent, i: number) => {
    const n = items.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onChange(items[to].id);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };

  return (
    <div className="ds-tabs" role="tablist" aria-label={label} ref={listRef}>
      {items.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          id={`${idPrefix}-tab-${t.id}`}
          aria-selected={t.id === value}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={t.id === value ? 0 : -1}
          className="ds-tabs__tab"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
        </button>
      ))}
      <span
        className="ds-tabs__indicator"
        aria-hidden="true"
        style={{ width: indicator.w, transform: `translateX(${indicator.x}px)` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meter: a probability bar with an optional observed frequency mark.

export function Meter({ value, observed, tone = "ink", label }: {
  value: number;
  observed?: number;
  tone?: "ink" | "date";
  label: string;
}) {
  return (
    <div
      className={`ds-meter ds-meter--${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(value.toFixed(4))}
    >
      <div className="ds-meter__fill" style={{ width: `${value * 100}%` }} />
      {observed !== undefined && (
        <div className="ds-meter__observed" style={{ left: `${observed * 100}%` }} title="Observed so far" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readout

export function Readout({ children }: { children: ReactNode }) {
  return <dl className="ds-readout">{children}</dl>;
}

export function ReadoutRow({ label, value, aside, swatch }: {
  label: string;
  value: ReactNode;
  aside?: ReactNode;
  swatch?: "ink" | "date";
}) {
  return (
    <div className="ds-readout__row">
      <dt className="ds-readout__label">{swatch && <Swatch tone={swatch} />}{label}</dt>
      <dd className="ds-readout__value">{value}</dd>
      {aside !== undefined && <dd className="ds-readout__aside">{aside}</dd>}
    </div>
  );
}

/**
 * A readout row that is also a toggle: the whole row is one button, and its
 * check mark shows whether that thing is switched on.
 */
export function ReadoutToggle({ label, value, aside, tone = "ink", on, onClick, hint }: {
  label: string;
  value: ReactNode;
  aside?: ReactNode;
  tone?: "ink" | "date";
  on: boolean;
  onClick: () => void;
  hint: string;
}) {
  return (
    <button type="button" className={`ds-readout__row ds-readout__row--toggle${on ? "" : " is-off"}`}
      aria-pressed={on} onClick={onClick} title={hint}>
      <span className="ds-readout__label"><Check tone={tone} on={on} />{label}</span>
      <span className="ds-readout__value">{value}</span>
      {aside !== undefined && <span className="ds-readout__aside">{aside}</span>}
    </button>
  );
}

export function Check({ tone = "ink", on }: { tone?: "ink" | "date"; on: boolean }) {
  return (
    <span className={`ds-check ds-check--${tone}${on ? " is-on" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 12 12"><path d="M2.5 6.4 4.9 8.7 9.5 3.6" /></svg>
    </span>
  );
}

export function Swatch({ tone = "ink", dashed = false }: { tone?: "ink" | "date"; dashed?: boolean }) {
  return <span className={`ds-swatch ds-swatch--${tone}${dashed ? " ds-swatch--dashed" : ""}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Tex: KaTeX, rendered to a string so React owns the DOM node.

const KATEX_OPTS = {
  throwOnError: false,
  strict: false,
  trust: (ctx: { command: string }) => ctx.command === "\\htmlClass",
  macros: { "\\ket": "\\lvert #1\\rangle" },
};

export function Tex({ src, display = false, className, as: As = "span" }: {
  src: string;
  display?: boolean;
  className?: string;
  as?: "span" | "div";
}) {
  const html = katex.renderToString(src, { ...KATEX_OPTS, displayMode: display });
  return <As className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
