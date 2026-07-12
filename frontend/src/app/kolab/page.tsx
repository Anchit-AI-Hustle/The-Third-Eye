export const metadata = { title: "Kolab — The Third Eye" };

// Kolab is a self-contained creator/brand platform served as a static app at
// /kolab.html; embedding it here keeps its own state/auth intact while giving
// it a tab inside The Third Eye. Privileged numbers load from /api/kolab/config.
export default function KolabPage() {
  return (
    <iframe
      src="/kolab.html"
      title="Kolab"
      className="w-full h-full border-0"
      allow="clipboard-write; microphone"
    />
  );
}
