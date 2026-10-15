import type { UserSummary } from "../lib/types";
import Dot from "./Dot";

export default function UserList({
  users,
  online,
  onSelectUser,
}: {
  users: UserSummary[];
  online: Set<string>;
  onSelectUser: (u: UserSummary) => void;
}) {
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
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onSelectUser(u)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-sepia/10 ${
                isOnline ? "text-sepia" : "text-sepia/35"
              }`}
            >
              <Dot on={isOnline} />
              {u.username}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
