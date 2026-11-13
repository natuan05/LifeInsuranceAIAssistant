'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Actor } from '@/lib/auth-api';
import { ownProfile, type OwnProfile } from '@/lib/customer-api';
import { ownPolicies, type Policy } from '@/lib/policy-api';
import { listProducts, type Product } from '@/lib/product-api';
import { realtimeEvent } from '@/lib/realtime';
import { notificationEvent } from '@/lib/chat-realtime';
import type { CustomerTab } from './customer-header';
import { CustomerHome } from './customer-home';
import { CustomerPolicies } from './customer-policies';
import { CustomerProducts } from './customer-products';
import { CustomerAdvisor } from './customer-advisor';
import { CustomerTickets } from './customer-tickets';
import { CustomerAccount } from './customer-account';
import { CustomerAccountMenu } from './customer-account-menu';
import { CustomerConversations } from './customer-conversations';
import {
  customerNotifications,
  readCustomerNotification,
  readAllCustomerNotifications,
  type CustomerNotification,
} from '@/lib/notification-api';

export function CustomerWorkspace({
  actor,
  csrfToken,
  blocked,
  account = false,
  accountContent,
  onSignOut,
  pendingSignOut,
}: {
  actor: Actor;
  csrfToken: string;
  blocked: boolean;
  account?: boolean;
  accountContent?: ReactNode;
  onSignOut: () => void;
  pendingSignOut: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ policyId?: string }>();
  const searchParams = useSearchParams();
  const selectedConversation = searchParams.get('conversationId');

  const isPolicyRoute = pathname?.startsWith('/customer/policies');

  const [activeTab, setActiveTab] = useState<CustomerTab>(
    account ? 'profile' : isPolicyRoute ? 'policies' : selectedConversation ? 'chat' : 'dashboard'
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [revision, setRevision] = useState(0);

  const notiRef = useRef<HTMLDivElement>(null);
  const loadedKey = useRef('');

  const [prevConversation, setPrevConversation] = useState(selectedConversation);
  if (selectedConversation !== prevConversation) {
    setPrevConversation(selectedConversation);
    if (selectedConversation) {
      setActiveTab('chat');
    }
  }

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (pathname.startsWith('/customer/policies')) {
      setActiveTab('policies');
    } else if (pathname === '/customer' && activeTab === 'policies') {
      setActiveTab('dashboard');
    }
  }

  const handleNavigateTab = (tab: CustomerTab) => {
    setActiveTab(tab);
    if (tab === 'policies') {
      router.push('/customer/policies');
    } else if (tab === 'dashboard' || tab === 'home') {
      router.push('/customer');
    }
  };

  // Click outside to close notification dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notiRef.current && !notiRef.current.contains(event.target as Node)) {
        setNotiOpen(false);
      }
    }
    if (notiOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [notiOpen]);

  // Load customer profile, policies, and products in parallel
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadData() {
      const key = `${actor.id}-${revision}`;
      if (loadedKey.current !== key) {
        loadedKey.current = key;
      }

      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
        const [profileRes, policiesRes, productsRes, notifsRes] = await Promise.allSettled([
          ownProfile(signal),
          ownPolicies(1, signal),
          listProducts('', 1, signal),
          customerNotifications(undefined, signal),
        ]);

        if (!active) return;

        if (profileRes.status === 'fulfilled') {
          setProfile(profileRes.value);
        }
        if (policiesRes.status === 'fulfilled' && Array.isArray(policiesRes.value?.items)) {
          setPolicies(policiesRes.value.items);
        }
        if (productsRes.status === 'fulfilled' && Array.isArray(productsRes.value?.items)) {
          setProducts(productsRes.value.items);
        }
        if (notifsRes.status === 'fulfilled' && Array.isArray(notifsRes.value?.items)) {
          setNotifications(notifsRes.value.items);
        }
      } catch {
        // Handled gracefully by individual views
      }
    }

    void loadData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [actor.id, revision]);

  // Realtime updates listener
  useEffect(() => {
    const onRealtime = () => setRevision(v => v + 1);
    const onNotificationChange = async () => {
      try {
        const notifs = await customerNotifications(undefined, AbortSignal.timeout(10000));
        if (Array.isArray(notifs?.items)) {
          setNotifications(notifs.items);
        }
      } catch {
        // Handled gracefully
      }
    };
    window.addEventListener(realtimeEvent, onRealtime);
    window.addEventListener(notificationEvent, onNotificationChange);
    return () => {
      window.removeEventListener(realtimeEvent, onRealtime);
      window.removeEventListener(notificationEvent, onNotificationChange);
    };
  }, []);

  // Active tab boolean helpers (for backward compatibility)
  const isDashboard = activeTab === 'home' || activeTab === 'dashboard';
  const isPolicies = activeTab === 'policies';
  const isProducts = activeTab === 'products';
  const isAdvisor = activeTab === 'advisor';
  const isChat = activeTab === 'chat';
  const isTickets = activeTab === 'tickets';
  const isProfile = activeTab === 'account' || activeTab === 'profile';

  // Header Title mapping
  const viewTitle = isDashboard
    ? 'Dashboard'
    : isPolicies
    ? 'My Policies'
    : isProducts
    ? 'Products'
    : isAdvisor
    ? 'My Staff'
    : isChat
    ? 'Conversations'
    : isTickets
    ? 'Support Tickets'
    : 'Account';

  // Notification helpers
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllAsRead = async () => {
    try {
      await readAllCustomerNotifications(csrfToken, new AbortController().signal);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (item: CustomerNotification) => {
    if (!item.isRead) {
      try {
        await readCustomerNotification(item.id, csrfToken, new AbortController().signal);
        setNotifications(prev =>
          prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n))
        );
      } catch {
        // ignore
      }
    }
    setNotiOpen(false);
    if (item.link?.type === 'CONVERSATION') {
      setActiveTab('chat');
      if (item.link.id) {
        router.push(`/customer?conversationId=${encodeURIComponent(item.link.id)}`);
      }
    } else if (item.link?.type === 'TICKET') {
      setActiveTab('tickets');
    }
  };

  const navBtnClass = (isActive: boolean) =>
    `tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2.5 tw:rounded-xl tw:text-xs tw:font-medium tw:transition-all tw:cursor-pointer ${
      isActive
        ? 'active tw:bg-blue-50 tw:text-blue-700 tw:font-semibold tw:shadow-2xs'
        : 'tw:text-slate-600 tw:hover:text-slate-900 tw:hover:bg-slate-100/70'
    }`;

  const iconClass = (isActive: boolean) =>
    `tw:w-4 tw:h-4 tw:shrink-0 ${isActive ? 'tw:text-blue-600' : 'tw:text-slate-400'}`;

  const customerInitial = (actor.fullName || 'Customer').charAt(0).toUpperCase();

  return (
    <div className="tw:h-[100dvh] tw:w-full tw:overflow-hidden tw:bg-slate-50 tw:flex tw:font-staff">
      {/* ================= COLUMN 1: NAVIGATION SIDEBAR ================= */}
      <aside
        className={`cust-nav-col tw:shrink-0 tw:bg-white tw:border-r tw:border-slate-200/80 tw:flex tw:flex-col tw:transition-all tw:duration-200 tw:z-20 ${
          sidebarCollapsed ? 'tw:w-[68px]' : 'tw:w-[230px]'
        }`}
          id="sidebar"
        >
          {/* Top Header: Brand Dropdown + Collapse Button */}
          <div className="tw:px-4 tw:pt-4 tw:pb-3 tw:flex tw:items-center tw:justify-between tw:shrink-0">
            <div
              className="tw:flex tw:items-center tw:gap-2.5 tw:cursor-pointer"
              title="AegisLife"
              onClick={() => setActiveTab('dashboard')}
            >
              <svg
                className="tw:text-slate-900 tw:shrink-0"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {!sidebarCollapsed && (
                <span className="tw:text-base tw:font-bold tw:tracking-tight tw:text-slate-900">
                  AegisLife
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="tw:w-7 tw:h-7 tw:rounded-lg tw:border tw:border-slate-200 tw:bg-white tw:flex tw:items-center tw:justify-center tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-50 tw:shadow-2xs tw:transition-all tw:cursor-pointer"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <polyline points={sidebarCollapsed ? '12 10 14 12 12 14' : '14 10 12 12 14 14'} />
              </svg>
            </button>
          </div>

          {/* Quick Search */}
          {!sidebarCollapsed && (
            <div className="tw:px-3.5 tw:pb-2">
              <div className="tw:relative">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  aria-label="Quick search"
                  className="tw:w-full tw:h-8 tw:pl-8 tw:pr-3 tw:rounded-lg tw:border tw:border-slate-200 tw:bg-slate-50/70 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:focus:bg-white tw:focus:outline-hidden tw:focus:border-blue-500 tw:transition-all"
                />
              </div>
            </div>
          )}

          {/* Navigation Groups */}
          <div className="tw:flex-1 tw:overflow-y-auto tw:p-3 tw:flex tw:flex-col tw:gap-4">
            
            {/* GROUP 1: PORTFOLIO */}
            <div className="tw:flex tw:flex-col tw:gap-1">
              {!sidebarCollapsed && (
                <div className="tw:px-3 tw:py-1 tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                  PORTFOLIO
                </div>
              )}

              {/* 1. Dashboard */}
              <button
                type="button"
                onClick={() => handleNavigateTab('dashboard')}
                className={navBtnClass(isDashboard)}
                title="Dashboard"
              >
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <svg className={iconClass(isDashboard)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  {!sidebarCollapsed && <span className="tw:truncate">Dashboard</span>}
                </div>
              </button>

              {/* 2. My Policies */}
              <button
                type="button"
                onClick={() => handleNavigateTab('policies')}
                className={navBtnClass(isPolicies)}
                title="My Policies"
              >
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <svg className={iconClass(isPolicies)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {!sidebarCollapsed && <span className="tw:truncate">My Policies</span>}
                </div>
                {!sidebarCollapsed && policies.length > 0 && (
                  <span className="tw:text-[11px] tw:font-bold tw:bg-slate-100 tw:text-slate-600 tw:px-1.5 tw:py-0.5 tw:rounded-full">
                    {policies.length}
                  </span>
                )}
              </button>

              {/* 3. Products */}
              <button
                type="button"
                onClick={() => setActiveTab('products')}
                className={navBtnClass(isProducts)}
                title="Products"
              >
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <svg className={iconClass(isProducts)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  {!sidebarCollapsed && <span className="tw:truncate">Products</span>}
                </div>
              </button>

              {/* 4. My Staff */}
              <button
                type="button"
                onClick={() => setActiveTab('advisor')}
                className={navBtnClass(isAdvisor)}
                title="My Staff"
              >
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <svg className={iconClass(isAdvisor)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {!sidebarCollapsed && <span className="tw:truncate">My Staff</span>}
                </div>
              </button>
            </div>

            {/* GROUP 2: COMMUNICATIONS */}
            <div className="tw:flex tw:flex-col tw:gap-1">
              {!sidebarCollapsed && (
                <div className="tw:px-3 tw:py-1 tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                  COMMUNICATIONS
                </div>
              )}

              {/* 5. Conversations */}
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={navBtnClass(isChat)}
                title="Conversations"
              >
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <svg className={iconClass(isChat)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {!sidebarCollapsed && <span className="tw:truncate">Conversations</span>}
                </div>
              </button>

              {/* 6. Support Tickets */}
              <button
                type="button"
                onClick={() => setActiveTab('tickets')}
                className={navBtnClass(isTickets)}
                title="Support Tickets"
              >
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <svg className={iconClass(isTickets)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                  {!sidebarCollapsed && <span className="tw:truncate">Support Tickets</span>}
                </div>
                {!sidebarCollapsed && (
                  <span className="tw:text-[11px] tw:font-bold tw:bg-slate-100 tw:text-slate-600 tw:px-1.5 tw:py-0.5 tw:rounded-full">
                    1
                  </span>
                )}
              </button>
            </div>

          </div>

          {/* Bottom Profile Footer: Interactive Account Options Menu */}
          <CustomerAccountMenu
            actor={actor}
            pending={pendingSignOut}
            collapsed={sidebarCollapsed}
            isProfile={isProfile}
            onSelectProfile={() => handleNavigateTab('profile')}
            onSignOut={onSignOut}
          />
        </aside>

        {/* ================= WORKSPACE MAIN AREA ================= */}
        <div className="tw:flex-1 tw:flex tw:flex-col tw:min-w-0 tw:bg-slate-50/50 tw:overflow-hidden">
          
          {/* Top Navigation Toolbar */}
          <header aria-label="Customer workspace toolbar" className="tw:h-14 tw:px-6 tw:bg-white tw:border-b tw:border-slate-200/80 tw:flex tw:items-center tw:justify-between tw:shrink-0 tw:z-30">
            <div className="tw:flex tw:items-center tw:gap-2 tw:text-xs">
              <button
                type="button"
                onClick={() => handleNavigateTab('dashboard')}
                className="tw:font-semibold tw:text-slate-800 tw:hover:text-blue-600 tw:transition-colors tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0"
              >
                Customer workspace
              </button>
              <span className="tw:text-slate-300" aria-hidden="true">/</span>
              <span className="tw:font-semibold tw:text-blue-600">{viewTitle}</span>
            </div>

            {/* Top Right: ONLY the Notification Bell */}
            <div className="tw:relative tw:z-50" ref={notiRef}>
              <button
                type="button"
                id="btn-notifications"
                onClick={() => setNotiOpen(!notiOpen)}
                className={`tw:w-9 tw:h-9 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:flex tw:items-center tw:justify-center tw:text-slate-600 tw:hover:text-slate-900 tw:hover:bg-slate-50 tw:shadow-2xs tw:transition-all tw:cursor-pointer tw:relative ${
                  notiOpen ? 'tw:bg-blue-50 tw:border-blue-200 tw:text-blue-600' : ''
                }`}
                title="Notifications"
                aria-expanded={notiOpen}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="tw:absolute tw:top-1.5 tw:right-1.5 tw:w-2 tw:h-2 tw:rounded-full tw:bg-red-500 tw:border-2 tw:border-white" />
                )}
              </button>

              {/* Notifications Interactive Popover */}
              {notiOpen && (
                <div className="tw:absolute tw:top-full tw:right-0 tw:mt-2 tw:w-80 tw:sm:w-96 tw:bg-white tw:rounded-2xl tw:border tw:border-slate-200/90 tw:shadow-2xl tw:overflow-hidden tw:z-50 tw:animate-in tw:fade-in-50">
                  <div className="tw:p-4 tw:border-b tw:border-slate-100 tw:flex tw:items-center tw:justify-between tw:bg-slate-50/70">
                    <div className="tw:flex tw:items-center tw:gap-2">
                      <span className="tw:text-xs tw:font-bold tw:text-slate-900">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="tw:text-[10px] tw:font-bold tw:bg-amber-100 tw:text-amber-800 tw:px-1.5 tw:py-0.2 tw:rounded-full">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="tw:text-[11px] tw:font-semibold tw:text-emerald-700 tw:hover:text-emerald-800 tw:cursor-pointer"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="tw:max-h-80 tw:overflow-y-auto tw:divide-y tw:divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="tw:p-6 tw:text-center tw:text-xs tw:text-slate-400">
                        Không có thông báo mới
                      </div>
                    ) : (
                      notifications.map(item => (
                        <div
                          key={item.id}
                          onClick={() => void handleNotificationClick(item)}
                          className={`tw:p-3.5 tw:flex tw:items-start tw:gap-3 tw:cursor-pointer tw:transition-all ${
                            !item.isRead ? 'tw:bg-blue-50/40 tw:hover:bg-blue-50/70' : 'tw:hover:bg-slate-50'
                          }`}
                        >
                          <div className={`tw:w-7 tw:h-7 tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:mt-0.5 ${
                            item.kind === 'STAFF_ACCEPTED_HANDOFF'
                              ? 'tw:bg-emerald-100/70 tw:text-emerald-700'
                              : item.kind === 'SUPPORT_TICKET_CREATED'
                              ? 'tw:bg-amber-100/70 tw:text-amber-700'
                              : 'tw:bg-blue-100/70 tw:text-blue-700'
                          }`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              {item.kind === 'SUPPORT_TICKET_CREATED' ? (
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                              ) : (
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                              )}
                            </svg>
                          </div>
                          <div className="tw:flex-1 tw:min-w-0">
                            <div className="tw:text-xs tw:font-bold tw:text-slate-900 tw:truncate">
                              {item.title}
                            </div>
                            <div className="tw:text-[10px] tw:text-slate-400 tw:mt-1">
                              {new Date(item.createdAt).toLocaleString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </div>
                          </div>
                          {!item.isRead && (
                            <span className="tw:w-2 tw:h-2 tw:rounded-full tw:bg-emerald-500 tw:shrink-0 tw:mt-1.5" />
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="tw:p-2 tw:bg-slate-50 tw:border-t tw:border-slate-100 tw:text-center">
                    <span className="tw:text-[10px] tw:text-slate-400">
                      Protected by AegisLife Enterprise Security
                    </span>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Main Viewport */}
          <main className={isChat ? "tw:flex-1 tw:min-h-0 tw:overflow-hidden tw:flex tw:flex-col" : "tw:flex-1 tw:overflow-y-auto tw:p-4 tw:sm:p-6"}>
            
            {/* View 1: Dashboard */}
            {isDashboard && (
              <CustomerHome
                actor={actor}
                profile={profile}
                policies={policies}
                products={products}
                onNavigateTab={handleNavigateTab}
              />
            )}

            {/* View 2: My Policies */}
            {isPolicies && (
              <CustomerPolicies selectedPolicyId={params?.policyId} onOpenChat={() => handleNavigateTab('chat')} />
            )}

            {/* View 3: Products */}
            {isProducts && (
              <CustomerProducts
                csrfToken={csrfToken}
                blocked={blocked}
              />
            )}

            {/* View 4: My Advisor */}
            {isAdvisor && (
              <CustomerAdvisor
                actor={actor}
                profile={profile}
                onNavigateTab={handleNavigateTab}
              />
            )}

            {/* View 5: Conversations */}
            {isChat && (
              <CustomerConversations csrfToken={csrfToken} blocked={blocked} />
            )}

            {/* View 6: Support Tickets */}
            {isTickets && (
              <CustomerTickets
                onOpenChat={() => setActiveTab('chat')}
                csrfToken={csrfToken}
                blocked={blocked}
                policies={policies.map((p) => ({
                  id: p.id,
                  policyNumber: p.policyNumber,
                  productName: p.product?.name,
                }))}
              />
            )}

            {/* View 7: Profile & Security */}
            {isProfile && (
              <CustomerAccount
                actor={actor}
                customer={profile?.customer}
                onSignOut={onSignOut}
                pendingSignOut={pendingSignOut}
              >
                {accountContent}
              </CustomerAccount>
            )}

          </main>

        </div>
      </div>
    );
}
