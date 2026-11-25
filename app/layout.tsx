import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { FiltroTraco } from "@/components/ui/FiltroTraco";
import "./globals.css";

// Fontes OFL self-hosted (Google Fonts), sem depender de rede no build.
const caveatBrush = localFont({
  src: "./fonts/CaveatBrush.woff2",
  variable: "--font-caveat-brush",
  weight: "400",
  display: "swap",
});

const nunito = localFont({
  src: "./fonts/Nunito.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Costa Neon",
  description:
    "Estratégia multiplayer numa metrópole litorânea neon. Construa, recrute, conquiste.",
};

export const viewport: Viewport = {
  themeColor: "#1FB6D5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${caveatBrush.variable} ${nunito.variable}`}>
      <body className="antialiased">
        <FiltroTraco />
        {children}
      </body>
    </html>
  );
}
