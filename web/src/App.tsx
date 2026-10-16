import { useEffect, useState } from "react";
import { useSettings } from "./lib/settings";
import { Spinner } from "./ui";
import { api } from "./lib/api";
import type { User } from "./lib/types";
import Join from "./views/Join";
import Login from "./views/Login";
import Chat from "./views/Chat";

// Text size is a document-level preference, applied on the root element so
// every rem-based size follows it.
const fontSizes: Record<string, string> = { default: "", normal: "16px", large: "18px" };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(window.location.pathname === "/join");
  const { settings } = useSettings();

  useEffect(() => {
    document.documentElement.style.fontSize = fontSizes[settings.fontSize] ?? "16px";
  }, [settings.fontSize]);

  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }
  if (!user && showJoin) {
    return (
      <Join
        onJoin={(u) => {
          window.history.replaceState(null, "", "/");
          setShowJoin(false);
          setUser(u);
        }}
      />
    );
  }
  if (!user) {
    return <Login onLogin={setUser} />;
  }
  return <Chat user={user} onLogout={() => setUser(null)} />;
}
