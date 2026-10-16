import { Component, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight } from "lucide-react";

const Collapsed = createContext(false);

// Images render inline; clicking one opens it in a full-window focus dialog.
// When the message's header is collapsed, images are hidden and their names
// show as chips beside the header toggle.
function Image({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const collapsed = useContext(Collapsed);
  // Esc closes the viewer. Capture phase + stopPropagation so it doesn't also
  // dismiss whatever else listens for Escape (e.g. the message actions pane).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!src) return alt ? <span>{alt}</span> : null;
  if (collapsed) return null; // names are shown in the header row instead
  return (
    <>
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="cursor-zoom-in"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-scrim p-4"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt ?? ""} className="max-h-full max-w-full rounded" />
        </div>
      )}
    </>
  );
}

const components = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: Image,
};

class Fallback extends Component<{ text: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <span className="whitespace-pre-wrap break-words">{this.props.text}</span>;
    }
    return this.props.children;
  }
}

// Markdown renders a message body as GFM. Single newlines become hard breaks so
// multiline input shows as typed. If rendering ever throws, the raw text is
// shown instead. Messages containing images get a header to collapse them; the
// header lines up with the username column.
export default function Markdown({
  text,
  collapsed,
  onToggle,
}: {
  text: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const names = [...text.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)].map((m) => m[1] || "image");
  const count = names.length;
  return (
    <Fallback text={text}>
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "show images" : "hide images"}
            className="flex items-center gap-1 text-xs leading-6 text-faint hover:text-muted"
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            {count} image{count > 1 ? "s" : ""}
          </button>
          {collapsed &&
            names.map((name, i) => (
              <span
                key={i}
                className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-muted"
              >
                {name}
              </span>
            ))}
        </div>
      )}
      <Collapsed.Provider value={collapsed}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
          {text}
        </ReactMarkdown>
      </Collapsed.Provider>
    </Fallback>
  );
}
