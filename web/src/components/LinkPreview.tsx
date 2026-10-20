import { ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "cn";
import { IconButton } from "@/ui";
import { userColor } from "../lib/scheme";
import type { Preview } from "../lib/types";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// LinkPreview is the Open Graph card for a message's first link. The server
// fetched it and cached the thumbnail, so nothing here contacts the linked site
// until the user clicks through. The header toggles it, like the image header.
export default function LinkPreview({
  preview,
  collapsed,
  onToggle,
  onRemove,
  pinned,
}: {
  preview: Preview;
  collapsed: boolean;
  onToggle: () => void;
  // Given only to the message's author: removes the card for everyone.
  onRemove?: () => void;
  // The message is selected: keep the remove button showing without a hover.
  pinned?: boolean;
}) {
  const site = preview.site || host(preview.url);
  return (
    <div className="pl-5 md:pl-8">
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? "show preview" : "hide preview"}
        className="flex max-w-full items-center gap-1 text-xs leading-6 text-faint hover:text-muted"
      >
        {collapsed ? (
          <ChevronRight className="size-3 shrink-0" />
        ) : (
          <ChevronDown className="size-3 shrink-0" />
        )}
        <span className="truncate">preview{collapsed && ` · ${site}`}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 mb-1 flex items-start gap-1">
          <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block min-w-0 max-w-md flex-1 overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-accent/60"
          >
            {preview.image && (
              <img
                src={preview.image}
                alt=""
                loading="lazy"
                className="max-h-48 w-full object-cover"
              />
            )}
            <div className="space-y-0.5 px-3 py-2">
              <div className="truncate text-[0.7rem] text-faint">{site}</div>
              {preview.title && (
                // Skittles color when enabled (plain text color otherwise). Keyed on
                // the URL, so it varies from card to card but is stable for a given link.
                <div
                  className="line-clamp-2 text-sm font-medium text-fg"
                  style={{ color: userColor(preview.url, "var(--fg)") }}
                >
                  {preview.title}
                </div>
              )}
              {preview.description && (
                <div className="line-clamp-3 text-xs text-muted">{preview.description}</div>
              )}
            </div>
          </a>
          {onRemove && (
            <IconButton
              label="remove preview"
              size="sm"
              className={cn(
                "text-danger hover:bg-danger/10 hover:text-danger",
                // Shown while the row is hovered, selected or has keyboard focus;
                // otherwise every card would carry an X.
                pinned
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100",
              )}
              onClick={onRemove}
            >
              <X />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
