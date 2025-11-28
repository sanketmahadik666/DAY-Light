import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SWRegister } from '@/components/SWRegister';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'DAY-LIGHT - Date-Based Fact Gallery',
  description: 'A cinematic, offline-capable gallery of historical facts',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        <SWRegister />
        {children}
      </body>
    </html>
  );
}

