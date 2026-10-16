import { Pencil, Trash2, X } from "lucide-react";
import { Button, IconButton } from "@/ui";
import type { Message, Reaction } from "../lib/types";
import { reactions } from "./MessageList";

// MessageActions is the contextual bar for the selected message. It replaces
// per-message hover toolbars: tap the ⋯ on any message and its actions appear
// here, reachable on touch screens and by keyboard alike.
export default function MessageActions({
  message,
  own,
  onReact,
  onEdit,
  onDelete,
  onClose,
}: {
  message: Message;
  own: boolean;
  onReact: (reaction: Reaction) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 px-2 pb-1 md:px-3">
      <div className="flex items-center gap-1 rounded-lg border border-line bg-raised p-1.5 shadow-lg">
        {reactions.map(({ key, label, Icon }) => (
          <IconButton
            key={key}
            label={`react ${label}`}
            size="sm"
            className="size-9"
            onClick={() => onReact(key)}
          >
            <Icon />
          </IconButton>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        <span className="min-w-0 flex-1 truncate px-1 text-xs text-faint">
          {message.username}: {message.body}
        </span>
        {own && (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil /> edit
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete}>
              <Trash2 /> delete
            </Button>
          </>
        )}
        <IconButton label="close message actions" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}
