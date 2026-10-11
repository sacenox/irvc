import { Component, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Images render inline; clicking one opens it in a full-window focus dialog.
function Image({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return alt ? <span>{alt}</span> : null;
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
// shown instead.
export default function Markdown({ text }: { text: string }) {
  return (
    <Fallback text={text}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </ReactMarkdown>
    </Fallback>
  );
}
