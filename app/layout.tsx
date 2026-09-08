import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Joukkuepotti — joukkueen kulut",
  description:
    "Jaa yhteiset kulut osallistujille ja näe jokaisen pelaajan osuus.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
