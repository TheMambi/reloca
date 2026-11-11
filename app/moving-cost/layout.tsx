// Static shell for /moving-cost. <h1> lives here so axe / Lighthouse can
// see it without waiting on the async page (an earlier loading-state bug).
export default function MovingCostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <h1 className="sr-only">Moving cost</h1>
      {children}
    </>
  );
}
