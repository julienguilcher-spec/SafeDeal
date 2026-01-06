import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SafeDeal — L’argent est bloqué. Pas promis.",
  description: "Coffre-fort transactionnel avec chat interne et compte à rebours."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="text-white">{children}</body>
    </html>
  );
}
