import type { ReactNode } from "react";
import { Hash, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Channel } from "../lib/types";

export default function Sidebar({
  channels,
  selected,
  onSelect,
}: {
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sepia/15">
      <div className="px-4 py-3 text-sm font-semibold text-gold">irvc</div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        <Group
          label="Text"
          channels={channels.filter((c) => c.type === "text")}
          selected={selected}
          onSelect={onSelect}
          icon={<Hash size={14} />}
        />
        <Group
          label="Voice"
          channels={channels.filter((c) => c.type === "voice")}
          selected={selected}
          onSelect={onSelect}
          icon={<Volume2 size={14} />}
        />
      </nav>
    </aside>
  );
}

function Group({
  label,
  channels,
  selected,
  onSelect,
  icon,
}: {
  label: string;
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-sepia/40">{label}</div>
      {channels.map((c) => (
        <Button
          key={c.id}
          variant={selected?.id === c.id ? "secondary" : "ghost"}
          onClick={() => onSelect(c)}
          className="w-full justify-start gap-2 font-normal"
        >
          {icon}
          {c.name}
        </Button>
      ))}
    </div>
  );
}
