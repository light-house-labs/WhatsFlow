/** Settings keep their menu on screen; only the section on the right waits for data. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="space-y-3">
        <div className="h-6 w-48 rounded bg-fill" />
        <div className="h-3.5 w-96 max-w-full rounded bg-fill" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border border-line p-5">
          <div className="h-4 w-40 rounded bg-fill" />
          <div className="h-9 w-full max-w-md rounded-md bg-fill" />
          <div className="h-9 w-full max-w-md rounded-md bg-fill" />
        </div>
      ))}
    </div>
  );
}
