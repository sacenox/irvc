import type { UserSummary } from "../lib/types";

export default function UserList({ users, online }: { users: UserSummary[]; online: Set<string> }) {
  const sorted = [...users].sort(
    (a, b) =>
      Number(online.has(b.username)) - Number(online.has(a.username)) ||
      a.username.localeCompare(b.username),
  );

  return (
    <aside className="w-56 shrink-0 overflow-y-auto border-l border-sepia/15">
      <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-sepia/40">Users</div>
      <ul className="space-y-0.5 px-2">
        {sorted.map((u) => {
          const isOnline = online.has(u.username);
          return (
            <li
              key={u.id}
              className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                isOnline ? "text-sepia" : "text-sepia/35"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-gold" : "bg-sepia/25"}`} />
              {u.username}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
