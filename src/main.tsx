import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles/page.css";
import { Shell } from "./components/Shell";
import { QlockProvider } from "./components/QlockContext";
import { renderLayout, type Layout } from "./ui/render";
import layout from "./ui/clock.layout.json";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QlockProvider>
      <Shell page="clock">{renderLayout(layout as Layout)}</Shell>
    </QlockProvider>
  </StrictMode>,
);
