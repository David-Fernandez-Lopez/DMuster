import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMuster",
  description: "Manage player availability across your tabletop RPG campaigns.",
};

/**
 * Root layout wrapping every page in the application.
 * Applies global styles and sets the base HTML structure.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {JSX.Element}
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
