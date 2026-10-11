import { Component, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Images are deferred: render only their alt text so `![]()` never injects an
// <img> yet.
const components = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }: { alt?: string }) => (alt ? <span>{alt}</span> : null),
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
