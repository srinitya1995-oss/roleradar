import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Role Radar",
  description: "Selective Principal GenAI role targeting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
