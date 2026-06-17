import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Requirement Agent Demo",
  description: "AI requirement engineering demo with PDF intake, SRS artifacts, and RAG retrieval.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
