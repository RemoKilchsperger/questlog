import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { unlockAudio } from "./game/sfx";
import "./index.css";

// Browser erlauben Ton erst nach einer Nutzeraktion – beim ersten Klick freischalten,
// damit die Kampfmusik gleich beim Kampfbeginn spielen kann.
window.addEventListener("pointerdown", unlockAudio, { once: true });

// Nur im Dev-Server: Testhelden per Adresse (?dev=testheld, ?dev=zurueck) – siehe src/dev/testHero.ts
if (import.meta.env.DEV) void import("./dev/testHero").then((m) => m.runDevCommand());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
