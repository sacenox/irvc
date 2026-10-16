import { useEffect, useState, type FormEvent } from "react";
import { Button, Centered, Spinner, TextInput } from "@/ui";
import AuthShell from "../components/AuthShell";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export default function Join({ onJoin }: { onJoin: (u: User) => void }) {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/invites/${token}`)
      .then(() => setValid(true))
      .catch(() => setValid(false));
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    try {
      onJoin(
        await api<User>("/claim", {
          method: "POST",
          body: JSON.stringify({
            token,
            username: form.get("username"),
            password: form.get("password"),
          }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (valid === null) {
    return (
      <div className="flex min-h-dvh">
        <Centered>
          <Spinner />
        </Centered>
      </div>
    );
  }
  if (!valid) {
    return (
      <div className="flex min-h-dvh bg-bg">
        <Centered>this invite is invalid or has expired</Centered>
      </div>
    );
  }

  return (
    <AuthShell subtitle="create your account" onSubmit={submit}>
      <TextInput
        name="username"
        placeholder="username"
        autoFocus
        autoComplete="username"
      />
      <TextInput
        name="password"
        type="password"
        placeholder="password (min 8 characters)"
        autoComplete="new-password"
      />
      {error && <p className="px-1 text-xs text-danger">{error}</p>}
      <Button variant="primary" size="lg" type="submit" className="w-full">
        join
      </Button>
    </AuthShell>
  );
}
