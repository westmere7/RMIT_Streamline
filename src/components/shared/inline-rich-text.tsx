import * as React from "react";
import { parseInline, type InlineNode } from "@/lib/rich-text";

/** A link's colour wherever form text carries one. Blue, never the brand red. */
export const INLINE_LINK_CLASS = "font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";

/**
 * A short piece of form text with its bold, italic, underline and links: the
 * hints, help lines and notes the booking form editor lets a manager format.
 * Inline only, so it sits inside the paragraph or span the caller already has;
 * a line break in the text is a line break here.
 *
 * `links={false}` draws a link's words in the link colour without the anchor,
 * for text inside something already clickable (a service card is a button).
 */
export function InlineRichText({ text, links = true }: { text: string; links?: boolean }) {
  const lines = React.useMemo(() => text.replace(/\r\n/g, "\n").split("\n"), [text]);
  return (
    <>
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 && <br />}
          <Nodes nodes={parseInline(line)} links={links} />
        </React.Fragment>
      ))}
    </>
  );
}

function Nodes({ nodes, links }: { nodes: InlineNode[]; links: boolean }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <React.Fragment key={index}>{node.text}</React.Fragment>;
          case "bold":
            return (
              <strong key={index} className="font-semibold">
                <Nodes nodes={node.children} links={links} />
              </strong>
            );
          case "italic":
            return (
              <em key={index}>
                <Nodes nodes={node.children} links={links} />
              </em>
            );
          case "underline":
            return (
              <u key={index} className="underline underline-offset-2">
                <Nodes nodes={node.children} links={links} />
              </u>
            );
          case "link":
            return links ? (
              <a key={index} href={node.href} target="_blank" rel="noreferrer noopener" className={INLINE_LINK_CLASS} onClick={(event) => event.stopPropagation()}>
                {node.label}
              </a>
            ) : (
              <span key={index} className={INLINE_LINK_CLASS}>
                {node.label}
              </span>
            );
          case "color":
            return <Nodes key={index} nodes={node.children} links={links} />;
          case "mention":
            return <React.Fragment key={index}>@{node.name}</React.Fragment>;
        }
      })}
    </>
  );
}
