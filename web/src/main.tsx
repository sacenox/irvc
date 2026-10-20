import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import Toasts from "./components/Toasts";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Toasts />
  </>,
);
