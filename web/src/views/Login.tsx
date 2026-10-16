import { useState, type FormEvent } from "react";
import { Button, TextInput } from "@/ui";
import AuthShell from "../components/AuthShell";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    try {
      onLogin(
        await api<User>("/login", {
          method: "POST",
          body: JSON.stringify({
            username: form.get("username"),
            password: form.get("password"),
          }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthShell subtitle="sign in" onSubmit={submit}>
      <TextInput name="username" placeholder="username" autoFocus autoComplete="username" />
      <TextInput
        name="password"
        type="password"
        placeholder="password"
        autoComplete="current-password"
      />
      {error && <p className="px-1 text-xs text-danger">{error}</p>}
      <Button variant="primary" size="lg" type="submit" className="w-full">
        enter
      </Button>
    </AuthShell>
  );
}
