/** Shown the instant a link is clicked, while the page's data loads. Shaped like a list page so the swap is quiet. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="flex items-end justify-between gap-4 border-b border-line px-6 pb-4 pt-6 max-md:hidden">
        <div className="space-y-3">
          <div className="h-6 w-44 rounded bg-fill" />
          <div className="h-3.5 w-80 max-w-full rounded bg-fill" />
        </div>
        <div className="h-9 w-28 rounded-md bg-fill" />
      </div>
      <div className="space-y-3 p-6 max-md:p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-full bg-fill" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded bg-fill" />
              <div className="h-3 w-3/5 rounded bg-fill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
