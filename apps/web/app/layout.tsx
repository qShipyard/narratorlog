import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { Space_Grotesk, Space_Mono, Newsreader } from 'next/font/google'
import './globals.css'
import { Providers } from '@/lib/providers'

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-display',
  weight: ['400', '500', '600', '700'],
})

const mono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-space-mono',
  weight: ['400', '700'],
})

const serif = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  style: ['normal', 'italic'],
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'narratorlog',
  description: 'Your codebase has a story. narratorlog tells it.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${display.variable} ${mono.variable} ${serif.variable}`}
    >
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}