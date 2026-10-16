import { useEffect, useState } from "react";
import { useSettings } from "./lib/settings";
import { Spinner } from "./ui";
import { api } from "./lib/api";
import type { User } from "./lib/types";
import Join from "./views/Join";
import Login from "./views/Login";
import Chat from "./views/Chat";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(window.location.pathname === "/join");
  // Applied here too so the logged-out screens follow the text size preference.
  useSettings();

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
