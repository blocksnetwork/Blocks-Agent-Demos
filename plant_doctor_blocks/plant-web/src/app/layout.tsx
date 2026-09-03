import type { Metadata } from "next";
import "./globals.css";
import "./doctor-theme.css";
import "./doctor-motion.css";

export const metadata: Metadata = {
  title: "Plant Doctor — One photo, one diagnosis",
  description:
    "Upload one photo of a plant and get the likely problem, the evidence behind it, and the steps to fix it.",
  openGraph: {
    images: ["/doctor-og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
