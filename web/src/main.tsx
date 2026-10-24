import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import Toasts from "./components/Toasts";
import { applyTheme, loadPrefs } from "./lib/theme";

// Before the first render, so the first paint already has the palette.
applyTheme(loadPrefs());

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Toasts />
  </>,
);
