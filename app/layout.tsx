import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = process.env.NEXT_PUBLIC_SESSION_TITLE || "Practical AI and agent use-case qualification";

export const metadata: Metadata = {
  title: "Six-lens vote",
  description: `Live voting for ${title}`,
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4300AD",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
