import { useEffect, useRef } from "react";

// Only the most recently mounted overlay reacts, so Escape in a confirmation opened from the
// history drawer closes the confirmation and leaves the drawer open.
const stack: Array<{ current: () => void }> = [];

function onKeyDown(event: KeyboardEvent) {
  const top = stack.at(-1);
  if (event.key === "Escape" && top && !event.isComposing) {
    event.preventDefault();
    top.current();
  }
}

export function useEscapeKey(onEscape: () => void): void {
  const handlerRef = useRef(onEscape);

  useEffect(() => {
    handlerRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (stack.length === 0) {
      document.addEventListener("keydown", onKeyDown);
    }
    stack.push(handlerRef);
    return () => {
      stack.splice(stack.lastIndexOf(handlerRef), 1);
      if (stack.length === 0) {
        document.removeEventListener("keydown", onKeyDown);
      }
    };
  }, []);
}
