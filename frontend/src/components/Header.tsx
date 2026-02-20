'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

type Language = 'en' | 'hi';

const ROLE_LABELS: Record<string, string> = {
  citizen: 'Citizen',
  registrar: 'Sub-Registrar',
  tehsildar: 'Tehsildar',
  bank: 'Bank Official',
  court: 'Court Official',
  admin: 'Administrator',
};

const ROLE_COLORS: Record<string, string> = {
  citizen: 'bg-bhulekh-blue-100 text-bhulekh-blue-800',
  registrar: 'bg-bhulekh-saffron-100 text-bhulekh-saffron-800',
  tehsildar: 'bg-purple-100 text-purple-800',
  bank: 'bg-bhulekh-green-100 text-bhulekh-green-800',
  court: 'bg-red-100 text-red-800',
  admin: 'bg-gray-800 text-white',
};

interface NavItem {
  href: string;
  label: string;
  labelHi: string;
  requiresAuth: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/search', label: 'Search', labelHi: 'खोजें', requiresAuth: false },
  {
    href: '/verify',
    label: 'Verify',
    labelHi: 'सत्यापन',
    requiresAuth: false,
  },
  {
    href: '/',
    label: 'Dashboard',
    labelHi: 'डैशबोर्ड',
    requiresAuth: true,
  },
  {
    href: '/transfer',
    label: 'Transfer',
    labelHi: 'हस्तांतरण',
    requiresAuth: true,
  },
];

export default function Header() {
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  };

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.requiresAuth || isAuthenticated
  );

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="bg-white shadow-govt sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & title */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-bhulekh-saffron-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-bold text-bhulekh-navy block leading-tight">
                BhulekhChain
              </span>
              <span className="text-xs text-gray-500 leading-tight">
                {language === 'en'
                  ? 'National Land Registry'
                  : 'राष्ट्रीय भूमि रजिस्ट्री'}
              </span>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'bg-bhulekh-saffron-50 text-bhulekh-saffron-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {language === 'en' ? item.label : item.labelHi}
              </Link>
            ))}
          </nav>

          {/* Right section */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label="Toggle language"
            >
              {language === 'en' ? 'हिंदी' : 'English'}
            </button>

            {/* Auth section */}
            {mounted && isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 leading-tight">
                    {user.name}
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                      ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : mounted ? (
              <Link href="/login" className="btn-primary text-sm px-4 py-2">
                Login with Aadhaar
              </Link>
            ) : null}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 py-4">
            <nav className="space-y-1">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-2.5 text-sm font-medium rounded-lg ${
                    isActive(item.href)
                      ? 'bg-bhulekh-saffron-50 text-bhulekh-saffron-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {language === 'en' ? item.label : item.labelHi}
                </Link>
              ))}
            </nav>

            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 px-4">
              <button
                onClick={toggleLanguage}
                className="w-full px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                {language === 'en' ? 'हिंदी में देखें' : 'View in English'}
              </button>

              {mounted && isAuthenticated && user ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-medium text-gray-900">
                      {user.name}
                    </p>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              ) : mounted ? (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary w-full text-sm text-center block"
                >
                  Login with Aadhaar
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
