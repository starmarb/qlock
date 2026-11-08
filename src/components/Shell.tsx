import type { ReactNode } from "react";

type Page = "clock" | "about" | "system";

const NAV: { id: Page; href: string; label: string }[] = [
  { id: "clock", href: "./", label: "Qlock" },
  { id: "about", href: "about.html", label: "About" },
  { id: "system", href: "system.html", label: "System" },
];

export function Shell({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <h1 className="wordmark"><a href="./">|qlock⟩</a></h1>
        <nav aria-label="Pages">
          {NAV.filter((n) => n.id !== page || page !== "clock").map((n) => (
            <a key={n.id} href={n.href} aria-current={n.id === page ? "page" : undefined}>{n.label}</a>
          ))}
        </nav>
      </header>
      <main className={page === "clock" ? undefined : "prose"}>{children}</main>
      <footer className="site-footer">
        <p>
          A personal project by Sammi Kwon, made with React, Three.js and hand-written GLSL.
        </p>
      </footer>
    </>
  );
}
