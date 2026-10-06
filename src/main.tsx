import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { unlockAudio } from "./game/sfx";
import "./index.css";

// Browser erlauben Ton erst nach einer Nutzeraktion – beim ersten Klick freischalten,
// damit die Kampfmusik gleich beim Kampfbeginn spielen kann.
window.addEventListener("pointerdown", unlockAudio, { once: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
