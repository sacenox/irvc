import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { User } from "./lib/types";
import Join from "./views/Join";
import Login from "./views/Login";
import Chat from "./views/Chat";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(window.location.pathname === "/join");

  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-sepia/40">loading…</div>;
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
