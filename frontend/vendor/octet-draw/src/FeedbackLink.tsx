// The Feedback button: a small round button just right of the tool palette, at the top left of the canvas. It shows
// its name while the pointer is over it or it has the focus, and opens a new mail to Sam in the mail app.
import { useLayoutEffect, useRef, useState } from "react";
import { ChatCircleDots } from "@phosphor-icons/react";

export function FeedbackLink({ onOpen }: { onOpen: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState<number>();
  // It sits a gap to the right of the palette, which is one or two columns wide.
  useLayoutEffect(() => {
    const palette = button.current?.parentElement?.querySelector<HTMLElement>(":scope > nav.palette");
    if (!palette) return;
    const place = () => setLeft(palette.offsetLeft + palette.offsetWidth + 8);
    place();
    const watch = new ResizeObserver(place);
    watch.observe(palette);
    return () => watch.disconnect();
  }, []);
  return (
    <button ref={button} className="feedback-link" style={left === undefined ? undefined : { left }} aria-label="Feedback" onClick={onOpen}>
      <ChatCircleDots size={16} aria-hidden />
      <span>Feedback</span>
    </button>
  );
}
