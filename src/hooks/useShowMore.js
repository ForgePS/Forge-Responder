import { useEffect, useMemo, useState } from "react";

/**
 * Draw long lists a page at a time: the first `step` rows, then "Show more".
 * The count goes back to one page when `resetKey` changes (a new search or filter),
 * but not when rows are edited, so editing doesn't collapse the list.
 */
export function useShowMore(rows = [], step = 100, resetKey = "") {
  const [count, setCount] = useState(step);
  useEffect(() => {
    setCount(step);
  }, [resetKey, step]);
  const list = Array.isArray(rows) ? rows : [];
  const shown = useMemo(() => list.slice(0, count), [list, count]);
  return {
    shown,
    remaining: Math.max(0, list.length - count),
    showMore: () => setCount((value) => value + step),
    showAll: () => setCount(list.length),
  };
}
