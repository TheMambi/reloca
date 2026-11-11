// Static shell for /transitions. The <h1> lives here (not in page.tsx) so
// it renders into the outer document and isn't buried inside the async
// page's Suspense streaming buffer — axe / Lighthouse only count
// headings that are reachable in the visible DOM (an earlier loading-state bug).
export default function TransitionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <h1 className="sr-only">Transitions</h1>
      {children}
    </>
  );
}
