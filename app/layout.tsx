import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adopt Me Inventory",
  description: "Track your Adopt Me pets across accounts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
