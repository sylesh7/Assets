import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { headers } from "next/headers"
import ContextProvider from '@/context'

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Prop99 - RWA Oracle Intelligence Layer",
  description:
    "Real-World Asset Oracle Intelligence Layer on Mantle. AI-powered property verification with blockchain security.",
  keywords: "RWA, Real World Assets, Oracle, Mantle, blockchain, AI verification, property tokenization",
  authors: [{ name: "Prop99" }],
  robots: "index, follow",
  openGraph: {
    title: "Prop99 - RWA Oracle Intelligence Layer",
    description: "Real-World Asset Oracle Intelligence Layer on Mantle",
    type: "website",
    locale: "en_US",
    siteName: "Prop99",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prop99 - RWA Oracle Intelligence Layer",
    description: "Real-World Asset Oracle Intelligence Layer on Mantle",
  },
  manifest: "/manifest.json",
  generator: 'v0.app'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const cookies = headersList.get('cookie')

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="font-sans antialiased">
        <ContextProvider cookies={cookies}>{children}</ContextProvider>
      </body>
    </html>
  )
}
