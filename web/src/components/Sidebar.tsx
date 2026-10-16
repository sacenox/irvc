import { useState, type ReactNode } from "react";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Hash,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings as SettingsIcon,
  UserPlus,
  Volume2,
} from "lucide-react";
import { cn } from "cn";
import { IconButton, Menu, MenuItem, Dot, VoiceMarks } from "@/ui";
import { api } from "../lib/api";
import { byName } from "../lib/channels";
import type { Channel, UserSummary, VoiceOccupant } from "../lib/types";
import type { Voice } from "../lib/voice";
import VoiceBar from "./VoiceBar";
import { userColor } from "../lib/scheme";

interface Props {
  channels: Channel[];
  unread: Record<number, number>;
  selected: Channel | null;
  users: UserSummary[];
  online: Set<string>;
  username: string;
  voice: Voice;
  voiceRooms: Record<string, VoiceOccupant[]>;
  deafened: boolean;
  onDeafen: (value: boolean) => void;
  openShare: string | null;
  onOpenShare: (id: string) => void;
  onSelect: (c: Channel) => void;
  onSelectUser: (u: UserSummary) => void;
  onCloseDM: (c: Channel) => void;
  onCreateChannel: (type: "text" | "voice", name: string) => Promise<void>;
  onDeleteChannel: (c: Channel) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  channels,
  unread,
  selected,
  users,
  online,
  username,
  voice,
  voiceRooms,
  deafened,
  onDeafen,
  openShare,
  onOpenShare,
  onSelect,
  onSelectUser,
  onCloseDM,
  onCreateChannel,
  onDeleteChannel,
  onOpenSettings,
  onLogout,
}: Props) {
  const [creating, setCreating] = useState<"text" | "voice" | null>(null);
  const [showUsers, setShowUsers] = useState(true);

  const texts = channels.filter((c) => c.type === "text").sort(byName);
  const voices = channels.filter((c) => c.type === "voice").sort(byName);
  const dms = channels.filter((c) => c.type === "dm").sort(byName);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-12 shrink-0 items-center px-4 text-sm font-semibold tracking-wide text-accent">
        irvc
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-2">
        <Group label="Text" onAdd={() => setCreating("text")}>
          {texts.map((c) => (
            <ChannelRow
              key={c.id}
              icon={<Hash size={14} />}
              name={c.name}
              badge={unread[c.id]}
              active={selected?.id === c.id}
              onSelect={() => onSelect(c)}
              actions={
                c.permanent
                  ? undefined
                  : (close) => (
                      <MenuItem onClick={() => (close(), onDeleteChannel(c))} danger>
                        delete channel
                      </MenuItem>
                    )
              }
            />
          ))}
          {creating === "text" && (
            <NewChannel
              onCancel={() => setCreating(null)}
              onSubmit={async (name) => {
                await onCreateChannel("text", name);
                setCreating(null);
              }}
            />
          )}
        </Group>

        <Group label="Voice" onAdd={() => setCreating("voice")}>
          {voices.map((c) => (
            <VoiceRow
              key={c.id}
              channel={c}
              voice={voice}
              occupants={voiceRooms[String(c.id)] ?? []}
              self={username}
              deafened={deafened}
              onDeafen={onDeafen}
              openShare={openShare}
              onOpenShare={onOpenShare}
              onDelete={() => onDeleteChannel(c)}
            />
          ))}
          {creating === "voice" && (
            <NewChannel
              onCancel={() => setCreating(null)}
              onSubmit={async (name) => {
                await onCreateChannel("voice", name);
                setCreating(null);
              }}
            />
          )}
        </Group>

        {dms.length > 0 && (
          <Group label="Direct messages">
            {dms.map((c) => (
              <ChannelRow
                key={c.id}
                icon={<AtSign size={14} />}
                name={c.name}
                badge={unread[c.id]}
                active={selected?.id === c.id}
                onSelect={() => onSelect(c)}
                actions={(close) => (
                  <MenuItem onClick={() => (close(), onCloseDM(c))}>close</MenuItem>
                )}
              />
            ))}
          </Group>
        )}

        <Group label="People" toggle={{ open: showUsers, set: () => setShowUsers((v) => !v) }}>
          {showUsers && <UserList users={users} online={online} onSelectUser={onSelectUser} />}
        </Group>
      </nav>

      <div className="shrink-0 px-2 pb-2">
        {/* Voice channel calls render in place in the Voice list; DM calls have no row. */}
        {voice.channel?.type === "dm" && (
          <VoiceBar
            voice={voice}
            self={username}
            deafened={deafened}
            onDeafen={onDeafen}
            openShare={openShare}
            onOpenShare={onOpenShare}
            occupants={voiceRooms[String(voice.channel.id)] ?? []}
            className="mb-2"
          />
        )}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <Dot on />
          <span className="min-w-0 flex-1 truncate text-sm">{username}</span>
          <InviteButton />
          <IconButton label="settings" size="sm" onClick={onOpenSettings}>
            <SettingsIcon />
          </IconButton>
          <IconButton label="log out" size="sm" onClick={onLogout}>
            <LogOut />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}

function Group({
  label,
  onAdd,
  toggle,
  children,
}: {
  label: string;
  onAdd?: () => void;
  toggle?: { open: boolean; set: () => void };
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex h-8 items-center justify-between pl-2">
        {toggle ? (
          <button
            type="button"
            onClick={toggle.set}
            className="section-label flex items-center gap-1 px-0 hover:text-muted"
          >
            {toggle.open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {label}
          </button>
        ) : (
          <span className="section-label px-0">{label}</span>
        )}
        {onAdd && (
          <IconButton label={`new ${label.toLowerCase()} channel`} size="sm" onClick={onAdd}>
            <Plus />
          </IconButton>
        )}
      </div>
      {children}
    </div>
  );
}

function ChannelRow({
  icon,
  name,
  badge,
  active,
  onSelect,
  actions,
}: {
  icon: ReactNode;
  name: string;
  badge?: number;
  active: boolean;
  onSelect: () => void;
  actions?: (close: () => void) => ReactNode;
}) {
  return (
    // The wrapper carries the active/hover chrome so it surrounds the actions button too.
    <div
      className={cn(
        "flex items-center rounded-md border pr-1 transition-colors",
        active ? "border-line bg-raised" : "border-transparent hover:bg-raised",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "row flex-1 hover:bg-transparent",
          active && "font-medium text-fg",
          !active && !!badge && "row-unread",
        )}
      >
        <span className="text-faint">{icon}</span>
        <span className="flex-1 truncate">{name}</span>
        {!!badge && <span className="badge">{badge > 99 ? "99+" : badge}</span>}
      </button>
      {actions && <Menu trigger={<MoreButton />}>{actions}</Menu>}
    </div>
  );
}

function VoiceRow({
  channel,
  voice,
  occupants,
  self,
  deafened,
  onDeafen,
  openShare,
  onOpenShare,
  onDelete,
}: {
  channel: Channel;
  voice: Voice;
  occupants: VoiceOccupant[];
  self: string;
  deafened: boolean;
  onDeafen: (value: boolean) => void;
  openShare?: string | null;
  onOpenShare?: (id: string) => void;
  onDelete: () => void;
}) {
  const active = voice.channel?.id === channel.id;
  // Once joined, the row becomes the call panel: same outline, roster and controls.
  if (active)
    return (
      <VoiceBar
        voice={voice}
        self={self}
        deafened={deafened}
        onDeafen={onDeafen}
        openShare={openShare}
        onOpenShare={onOpenShare}
        occupants={occupants}
        className="my-1"
      />
    );
  return (
    <div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => voice.join(channel)}
          className="row flex-1"
        >
          <span className="text-faint">
            <Volume2 size={14} />
          </span>
          <span className="flex-1 truncate">{channel.name}</span>
          <span className="text-xs text-faint">join</span>
        </button>
        {!channel.permanent && occupants.length === 0 && (
          <Menu trigger={<MoreButton />}>
            {(close) => (
              <MenuItem onClick={() => (close(), onDelete())} danger>
                delete channel
              </MenuItem>
            )}
          </Menu>
        )}
      </div>
      {occupants.length > 0 && (
        <ul className="space-y-0.5 pb-1 pl-7">
          {occupants.map((o) => (
            <li key={o.name} className="flex items-center gap-2 text-sm text-muted">
              <Dot on={false} />
              <span className="min-w-0 flex-1 truncate" style={{ color: userColor(o.name) }}>
                {o.name}
              </span>
              <VoiceMarks muted={o.muted} deafened={o.deafened} className="pr-1" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserList({
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
    <ul className="space-y-0.5">
      {sorted.map((u) => (
        <li key={u.id}>
          <button
            type="button"
            onClick={() => onSelectUser(u)}
            className={cn("row w-full", !online.has(u.username) && "text-faint")}
          >
            <Dot on={online.has(u.username)} />
            <span
              className="flex-1 truncate"
              style={online.has(u.username) ? { color: userColor(u.username) } : undefined}
            >
              {u.username}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewChannel({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="px-1 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <input
        autoFocus
        value={name}
        placeholder="channel name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onBlur={onCancel}
        className="input input-md"
      />
    </form>
  );
}

function MoreButton() {
  return (
    <IconButton label="more actions" size="sm" className="hover:bg-surface">
      <MoreHorizontal />
    </IconButton>
  );
}

function InviteButton() {
  const [copied, setCopied] = useState(false);
  async function invite() {
    try {
      const { token } = await api<{ token: string }>("/invites", { method: "POST" });
      await navigator.clipboard.writeText(`${window.location.origin}/join?token=${token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard or API refused; nothing useful to show here
    }
  }
  return (
    <IconButton label={copied ? "invite link copied" : "create invite link"} size="sm" onClick={invite}>
      {copied ? <Check /> : <UserPlus />}
    </IconButton>
  );
}
