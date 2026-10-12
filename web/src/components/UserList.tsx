import type { UserSummary } from "../lib/types";
import Dot from "./Dot";

export default function UserList({ users, online }: { users: UserSummary[]; online: Set<string> }) {
  const sorted = [...users].sort(
    (a, b) =>
      Number(online.has(b.username)) - Number(online.has(a.username)) ||
      a.username.localeCompare(b.username),
  );

  return (
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
            <Dot on={isOnline} />
            {u.username}
          </li>
        );
      })}
    </ul>
  );
}
