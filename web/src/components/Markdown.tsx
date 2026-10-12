import { Component, createContext, useContext, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight } from "lucide-react";

const Collapsed = createContext(false);

// Images render inline; clicking one opens it in a full-window focus dialog.
// When the message's header is collapsed, images shrink to an alt-text chip.
function Image({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const collapsed = useContext(Collapsed);
  if (!src) return alt ? <span>{alt}</span> : null;
  if (collapsed)
    return (
      <span className="my-1 inline-block rounded border border-sepia/15 bg-sepia/5 px-2 py-0.5 text-xs text-sepia/60">
        {alt || "image"}
      </span>
    );
  return (
    <>
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="my-1 max-h-80 max-w-full cursor-zoom-in rounded border border-sepia/15"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/80 p-4"
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
  const count = (text.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;
  return (
    <Fallback text={text}>
      {count > 0 && (
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "show images" : "hide images"}
          className="flex w-full items-center gap-1 text-xs leading-6 text-sepia/50 hover:text-sepia/80"
        >
          {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          {count} image{count > 1 ? "s" : ""}
        </button>
      )}
      <Collapsed.Provider value={collapsed}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
          {text}
        </ReactMarkdown>
      </Collapsed.Provider>
    </Fallback>
  );
}
