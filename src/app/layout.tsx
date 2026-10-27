import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TripMind — Planifica tu viaje",
  description:
    "Itinerarios, mapa interactivo, hoteles, restaurantes y transporte en un solo lugar.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <a
          href="#contenido"
          className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:shadow"
        >
          Saltar al contenido
        </a>
        <Providers>
          <SiteHeader />
          <div id="contenido">{children}</div>
          <FeedbackDialog />
        </Providers>
      </body>
    </html>
  );
}
