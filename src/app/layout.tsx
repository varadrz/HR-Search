import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR Finder - Advanced Recruiter Scout & Email Predictor",
  description: "Scout recruitment teams, hiring managers, and talent acquisition contacts globally. Predict corporate email formats and draft cold emails in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
        <link rel="icon" type="image/png" href="/logo.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
