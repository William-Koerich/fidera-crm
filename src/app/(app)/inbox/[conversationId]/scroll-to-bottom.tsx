"use client";

import { useEffect, useRef } from "react";

/** How close to the end (px) still counts as "reading the newest messages". */
const NEAR_BOTTOM = 120;

/**
 * Keeps the newest message in view inside the thread's own scroll area.
 * Jumps to the end when the conversation opens; when a message arrives or an
 * image finishes loading, follows only if the reader was already at the end,
 * so reading older messages is never interrupted. Never scrolls the page itself.
 */
export function ScrollToBottom({ token }: { token: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const anchor = ref.current;
    const scroller = anchor?.closest<HTMLElement>("[data-thread-scroll]");
    const content = anchor?.parentElement;
    if (!scroller || !content) return;

    const toEnd = () => {
      scroller.scrollTop = scroller.scrollHeight;
    };
    const onScroll = () => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM;
    };
    // Content grows when images load or the bar above shrinks the area: stay at the end if we were there.
    const resize = new ResizeObserver(() => {
      if (pinned.current) toEnd();
    });

    toEnd();
    pinned.current = true;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    resize.observe(content);
    resize.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>("[data-thread-scroll]");
    if (scroller && pinned.current) scroller.scrollTop = scroller.scrollHeight;
  }, [token]);

  return <div ref={ref} aria-hidden />;
}
