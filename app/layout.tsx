import type { Metadata } from "next";
import { Press_Start_2P, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";

import { cn } from "@/lib/utils";
import "./globals.css";

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-pixel",
  weight: "400",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "MAGI Cryptosystem",
  description:
    "Frontend prototype for a web-based super encryption system that layers Playfair, Rail Fence, and DES-CBC.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          pressStart.variable,
          spaceGrotesk.variable,
          "min-h-screen bg-black font-sans text-zinc-100 antialiased",
        )}
      >
        {children}
        <Toaster
          richColors
          theme="dark"
          position="top-right"
          toastOptions={{
            className: "border border-white/15 bg-black/92 text-zinc-100",
          }}
        />
      </body>
    </html>
  );
}
