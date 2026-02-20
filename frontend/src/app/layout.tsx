import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'BhulekhChain - National Land Registry',
  description:
    'India\'s National Blockchain Property Register. Secure, transparent, and tamper-proof land records powered by blockchain technology.',
  keywords: [
    'land registry',
    'blockchain',
    'bhulekh',
    'property records',
    'India',
    'government',
    'land records',
  ],
  authors: [{ name: 'BhulekhChain - Government of India' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        {/* Tricolor stripe at the top */}
        <div className="tricolor-stripe" />

        <Header />

        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-bhulekh-navy text-gray-300 py-8 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-white font-semibold text-lg mb-3">
                  BhulekhChain
                </h3>
                <p className="text-sm text-gray-400">
                  National Blockchain Property Register. A Government of India
                  initiative for transparent, tamper-proof land records.
                </p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-3">Quick Links</h4>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a href="/search" className="hover:text-white transition-colors">
                      Search Records
                    </a>
                  </li>
                  <li>
                    <a href="/verify" className="hover:text-white transition-colors">
                      Verify Property
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://dolr.gov.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white transition-colors"
                    >
                      Dept. of Land Resources
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-medium mb-3">Contact</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>Ministry of Rural Development</li>
                  <li>Government of India</li>
                  <li>helpdesk@bhulekhchain.gov.in</li>
                  <li>Toll-Free: 1800-XXX-XXXX</li>
                </ul>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-700 text-center text-sm text-gray-500">
              <p>
                &copy; {new Date().getFullYear()} BhulekhChain - Government of
                India. All rights reserved.
              </p>
              <p className="mt-1">
                Powered by Hyperledger Fabric, Algorand &amp; Polygon
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
