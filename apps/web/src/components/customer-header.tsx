'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import type { Actor } from '@/lib/auth-api';
import type { Customer } from '@/lib/customer-api';

export type CustomerTab =
  | 'home'
  | 'dashboard'
  | 'policies'
  | 'products'
  | 'advisor'
  | 'chat'
  | 'tickets'
  | 'account'
  | 'profile';

export function CustomerHeader({
  actor,
  customer,
  activeTab,
  onTabChange,
  onSignOut,
  pendingSignOut,
}: {
  actor: Actor;
  customer?: Customer | null;
  activeTab: CustomerTab;
  onTabChange: (tab: CustomerTab) => void;
  onSignOut: () => void;
  pendingSignOut: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const navItemClass = (tab: CustomerTab) =>
    `tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer ${
      activeTab === tab
        ? 'tw:bg-emerald-50 tw:text-emerald-800 tw:shadow-2xs'
        : 'tw:text-slate-600 tw:hover:text-slate-900 tw:hover:bg-slate-100/70'
    }`;

  const initials = (actor.fullName || 'Customer')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  return (
    <header className="tw:sticky tw:top-0 tw:z-40 tw:bg-white/90 tw:backdrop-blur-md tw:border-b tw:border-slate-200/80 tw:transition-all">
      <div className="tw:max-w-7xl tw:mx-auto tw:px-4 tw:sm:px-6 tw:lg:px-8">
        <div className="tw:flex tw:items-center tw:justify-between tw:h-16 tw:gap-4">
          
          {/* Brand Logo & Portal Tag */}
          <div className="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
            <button
              type="button"
              onClick={() => onTabChange('home')}
              className="tw:flex tw:items-center tw:gap-2.5 tw:cursor-pointer tw:bg-transparent tw:border-0 tw:p-0"
            >
              <div className="tw:w-9 tw:h-9 tw:rounded-xl tw:bg-gradient-to-br tw:from-emerald-600 tw:to-teal-700 tw:flex tw:items-center tw:justify-center tw:text-white tw:shadow-xs">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="tw:flex tw:flex-col tw:items-start tw:text-left">
                <span className="tw:text-base tw:font-extrabold tw:tracking-tight tw:text-slate-900">
                  AegisLife
                </span>
                <span className="tw:text-[9px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-emerald-700 tw:bg-emerald-50 tw:px-1.5 tw:py-0.2 tw:rounded-sm">
                  Customer Portal
                </span>
              </div>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="tw:hidden tw:md:flex tw:items-center tw:gap-1" aria-label="Customer Navigation">
            <button
              type="button"
              onClick={() => onTabChange('home')}
              className={navItemClass('home')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('policies')}
              className={navItemClass('policies')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>My Policies</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('products')}
              className={navItemClass('products')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Explore Solutions</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('chat')}
              className={navItemClass('chat')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Advisor & AI Assistant</span>
            </button>
          </nav>

          {/* Right Area: Search, Hotline, User Menu */}
          <div className="tw:flex tw:items-center tw:gap-3">
            
            {/* 24/7 Hotline Badge */}
            <div className="tw:hidden tw:lg:flex tw:items-center tw:gap-2 tw:bg-slate-100/80 tw:px-3 tw:py-1.5 tw:rounded-xl tw:text-xs tw:text-slate-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-emerald-600">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span className="tw:font-medium">Hotline:</span>
              <span className="tw:font-semibold tw:text-slate-900">1800-6868</span>
            </div>

            {/* User Account Popover */}
            <div className="tw:relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="tw:flex tw:items-center tw:gap-2.5 tw:p-1.5 tw:rounded-xl tw:hover:bg-slate-100 tw:transition-colors tw:cursor-pointer"
                aria-label="User account menu"
                aria-expanded={menuOpen}
              >
                <div className="tw:w-8 tw:h-8 tw:rounded-full tw:bg-gradient-to-tr tw:from-emerald-700 tw:to-teal-600 tw:text-white tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-bold tw:shadow-2xs">
                  {initials}
                </div>
                <div className="tw:hidden tw:sm:flex tw:flex-col tw:items-start tw:text-left">
                  <span className="tw:text-xs tw:font-bold tw:text-slate-900 tw:leading-tight">
                    {actor.fullName}
                  </span>
                  <span className="tw:text-[10px] tw:text-slate-500 tw:leading-tight">
                    {actor.accountCode}
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {menuOpen && (
                <div className="tw:absolute tw:right-0 tw:mt-2 tw:w-64 tw:rounded-2xl tw:bg-white tw:border tw:border-slate-200/80 tw:p-2 tw:shadow-lg tw:z-50 tw:animate-in tw:fade-in-50">
                  <div className="tw:px-3 tw:py-2.5 tw:border-b tw:border-slate-100">
                    <p className="tw:text-xs tw:font-bold tw:text-slate-900">{customer?.fullName ?? actor.fullName}</p>
                    <p className="tw:text-[11px] tw:text-slate-500">{customer?.email ?? actor.email}</p>
                    <p className="tw:text-[10px] tw:text-slate-400 tw:font-mono tw:mt-0.5">{customer?.accountCode ?? actor.accountCode}</p>
                  </div>

                  <div className="tw:py-1">
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange('account');
                        setMenuOpen(false);
                      }}
                      className="tw:w-full tw:flex tw:items-center tw:gap-2.5 tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-medium tw:text-slate-700 tw:hover:bg-slate-50 tw:transition-colors tw:text-left tw:cursor-pointer"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Account & Security
                    </button>
                    <Link
                      href="/connection"
                      className="tw:w-full tw:flex tw:items-center tw:gap-2.5 tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-medium tw:text-slate-700 tw:hover:bg-slate-50 tw:transition-colors tw:text-left tw:no-underline"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      Connection Status
                    </Link>
                  </div>

                  <div className="tw:pt-1 tw:border-t tw:border-slate-100">
                    <button
                      type="button"
                      onClick={onSignOut}
                      disabled={pendingSignOut}
                      className="tw:w-full tw:flex tw:items-center tw:gap-2.5 tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-semibold tw:text-red-600 tw:hover:bg-red-50 tw:transition-colors tw:text-left tw:cursor-pointer"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-red-500">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      {pendingSignOut ? 'Signing out…' : 'Sign out'}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="tw:flex tw:md:hidden tw:overflow-x-auto tw:py-2 tw:gap-2 tw:border-t tw:border-slate-100 tw:no-scrollbar">
          <button
            type="button"
            onClick={() => onTabChange('home')}
            className={navItemClass('home')}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => onTabChange('policies')}
            className={navItemClass('policies')}
          >
            My Policies
          </button>
          <button
            type="button"
            onClick={() => onTabChange('products')}
            className={navItemClass('products')}
          >
            Explore Solutions
          </button>
          <button
            type="button"
            onClick={() => onTabChange('chat')}
            className={navItemClass('chat')}
          >
            Advisor Chat
          </button>
        </div>

      </div>
    </header>
  );
}

