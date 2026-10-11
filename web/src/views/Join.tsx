import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AuthShell from "../components/AuthShell";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export default function Join({ onJoin }: { onJoin: (u: User) => void }) {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ valid: boolean }>(`/invites/${token}`)
      .then(() => setValid(true))
      .catch(() => setValid(false));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      onJoin(
        await api<User>("/claim", {
          method: "POST",
          body: JSON.stringify({ token, username, password }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (valid === null) {
    return (
      <div className="grid h-full place-items-center text-sm text-sepia/40">checking invite…</div>
    );
  }
  if (!valid) {
    return (
      <div className="grid h-full place-items-center text-sm text-sepia/60">
        invalid or expired invite
      </div>
    );
  }

  return (
    <AuthShell title="create your account" onSubmit={submit}>
      <Input
        placeholder="username"
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Input
        type="password"
        placeholder="password (min 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-xs text-gold">{error}</p>}
      <Button className="w-full" type="submit">
        join
      </Button>
    </AuthShell>
  );
}
