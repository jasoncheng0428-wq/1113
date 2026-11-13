import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "新創北區共成長｜會員工商名錄",
  description: "認識北區夥伴，找到合作機會，讓彼此的事業一起成長。",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
