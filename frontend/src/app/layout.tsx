import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'roomy — room cleanliness overwatch',
  description:
    'Ceiling camera that maps room cleanliness zones and suggests vibe-matched fixes.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
