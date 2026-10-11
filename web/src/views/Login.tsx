import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AuthShell from "../components/AuthShell";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      onLogin(
        await api<User>("/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthShell title="sign in" onSubmit={submit}>
      <Input
        placeholder="username"
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Input
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-xs text-gold">{error}</p>}
      <Button className="w-full" type="submit">
        enter
      </Button>
    </AuthShell>
  );
}
