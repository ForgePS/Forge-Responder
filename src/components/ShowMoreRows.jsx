/** "Showing 100 of 2,431 · Show 100 more · Show all" under a long list. */
export default function ShowMoreRows({ shown, remaining, step = 100, onMore, onAll }) {
  if (!remaining) return null;
  const total = shown + remaining;
  return (
    <div className="show-more-rows">
      <span>Showing {shown.toLocaleString()} of {total.toLocaleString()}</span>
      <button type="button" className="secondary-button" onClick={onMore}>Show {Math.min(step, remaining).toLocaleString()} more</button>
      <button type="button" className="link-button" onClick={onAll}>Show all</button>
    </div>
  );
}
