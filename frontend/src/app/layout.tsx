import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { BrandStyles } from "@/components/BrandStyles";
import { brand } from "@/config/brand";
import "./globals.css";

/**
 * Brand fonts: Google Sans (primary) + Gilroy (secondary).
 * These Google Fonts are temporary stand-ins until licensed files
 * are added under /public/fonts (see public/fonts/README.md).
 */
const primaryFont = DM_Sans({
  variable: "--font-primary",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const secondaryFont = Outfit({
  variable: "--font-secondary",
  subsets: ["latin"],
  weight: ["300", "800"],
});

export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  icons: {
    icon: [
      { url: "https://frontiercms.s3.us-east-1.amazonaws.com/favicon_88268a37e8.ico", sizes: "any" },
      { url: "https://frontiercms.s3.us-east-1.amazonaws.com/favicon_32_c6835beb3e.png", type: "image/png", sizes: "32x32" },
      { url: "https://frontiercms.s3.us-east-1.amazonaws.com/favicon_64_c9e53cc6bf.png", type: "image/png", sizes: "64x64" },
      { url: "https://frontiercms.s3.us-east-1.amazonaws.com/favicon_99403dfe09.png", type: "image/png", sizes: "192x192" },
      { url: "https://frontiercms.s3.us-east-1.amazonaws.com/favicon_512_bb9fbb8e6d.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "https://frontiercms.s3.us-east-1.amazonaws.com/apple_icon_e52806eb3c.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-portal-theme="light"
      suppressHydrationWarning
      className={`${primaryFont.variable} ${secondaryFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <BrandStyles />
        {children}
      </body>
    </html>
  );
}
