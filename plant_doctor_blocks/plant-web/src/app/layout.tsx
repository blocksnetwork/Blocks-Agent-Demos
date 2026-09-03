import type { Metadata } from "next";
import Script from "next/script";

// Fonts from kit.winner.tokens.fonts — Fraunces for display, Inter for body.
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

// Wire-up order from the design-blocks skill: existing styles, then the
// theme, then the motion kit; the screen's own styles come last.
import "./globals.css";
import "./design-theme.css";
import "./design-motion.css";
import "./doctor.css";

export const metadata: Metadata = {
  title: "Plant Doctor — One photo, one diagnosis",
  description:
    "Drop one photo of a plant and an agent on the Blocks network names the likely problem, shows its evidence, and writes the treatment plan.",
  openGraph: {
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        {/* The kit's motion script, loaded after hydration so its inline
            stagger styles never race React; MotionKit re-runs it on state changes. */}
        <Script src="/design-motion.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
