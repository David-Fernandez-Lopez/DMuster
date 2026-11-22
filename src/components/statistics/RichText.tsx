import { Fragment } from "react";

/** Matches `<b>…</b>` and `<big>…</big>` in a translated string. */
const TAG_PATTERN = /<(b|big)>(.*?)<\/\1>/g;

/**
 * Renders a translated string that carries `<b>` (secondary figure) and
 * `<big>` (headline figure, Cinzel in brand colour) markers. The text is split
 * and rebuilt as React nodes, never injected as HTML, so interpolated values
 * cannot add markup.
 *
 * @param {{ text: string }} props - The translated string.
 * @returns {JSX.Element} The text with its emphasis.
 */
export default function RichText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      nodes.push(<Fragment key={`t${last}`}>{text.slice(last, index)}</Fragment>);
    }
    nodes.push(
      match[1] === "big" ? (
        <b key={`b${index}`} className="font-display text-[22px] text-brand">
          {match[2]}
        </b>
      ) : (
        <b key={`b${index}`}>{match[2]}</b>
      ),
    );
    last = index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  }

  return <>{nodes}</>;
}
