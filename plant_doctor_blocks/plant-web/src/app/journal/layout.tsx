import type { Metadata } from "next";
import "./journal-theme.css";
import "./journal-motion.css";

export const metadata: Metadata = {
  title: "Plant Journal — a field notebook for your plants",
  description:
    "A dated diary per plant: photos, notes, watering and feeding events, and past Plant Doctor diagnoses on one timeline.",
  openGraph: {
    images: ["/journal-og.png"],
  },
};

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="journal-theme min-h-screen">{children}</div>;
}
