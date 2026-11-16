'use client';

import type { Actor } from '@/lib/auth-api';
import type { OwnProfile } from '@/lib/customer-api';
import type { Policy } from '@/lib/policy-api';
import type { Product } from '@/lib/product-api';
import { policyMoney, policyDate } from '@/lib/policy-api';
import type { CustomerTab } from './customer-header';

export function CustomerHome({
  actor,
  profile,
  policies,
  products,
  onNavigateTab,
}: {
  actor: Actor;
  profile: OwnProfile | null;
  policies: Policy[];
  products: Product[];
  onNavigateTab: (tab: CustomerTab) => void;
}) {
  const customer = profile?.customer;
  const staff = profile?.staff;
  const assignmentStatus = profile?.assignmentStatus ?? 'UNASSIGNED';

  // Calculate high-level protection metrics honestly from real policies
  const policyList = Array.isArray(policies) ? policies : [];
  const activePolicies = policyList.filter(p => p.status === 'ACTIVE');
  const totalSumAssured = activePolicies.reduce((acc, p) => {
    const num = parseFloat(p.sumAssured ?? '0');
    return isNaN(num) ? acc : acc + num;
  }, 0);

  // Find nearest upcoming due date
  const upcomingDueDate = activePolicies
    .map(p => p.nextDueDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? null;

  return (
    <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Hero Welcome Banner */}
      <section className="tw:relative tw:overflow-hidden tw:rounded-3xl tw:bg-gradient-to-br tw:from-slate-900 tw:via-slate-800 tw:to-teal-950 tw:p-6 tw:sm:p-8 tw:text-white tw:shadow-md">
        <div className="tw:relative tw:z-1 tw:flex tw:flex-col tw:md:flex-row tw:md:items-center tw:justify-between tw:gap-6">
          <div className="tw:space-y-2 tw:max-w-xl">
            <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
              <span className="tw:text-xs tw:text-slate-400 tw:font-mono">
                ID: {customer?.accountCode ?? actor.accountCode}
              </span>
            </div>
            <h1 className="tw:text-2xl tw:sm:text-3xl tw:font-extrabold tw:tracking-tight tw:text-white">
              Welcome back, {customer?.fullName ?? actor.fullName}
            </h1>
            <p className="tw:text-xs tw:sm:text-sm tw:text-slate-300 tw:leading-relaxed">
              Your life insurance protection portfolio and customer services are safeguarded with AegisLife. Review your coverage or reach out to your assigned staff anytime.
            </p>
          </div>

          <div className="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('policies')}
              className="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-2xl tw:bg-emerald-600 tw:px-4 tw:py-2.5 tw:text-xs tw:font-bold tw:text-white tw:shadow-xs tw:hover:bg-emerald-500 tw:transition-all tw:cursor-pointer"
            >
              <span>View My Policies</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('chat')}
              className="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-2xl tw:bg-white/10 tw:backdrop-blur-sm tw:border tw:border-white/20 tw:px-4 tw:py-2.5 tw:text-xs tw:font-bold tw:text-white tw:hover:bg-white/20 tw:transition-all tw:cursor-pointer"
            >
              <span>Contact Staff</span>
            </button>
          </div>
        </div>

        {/* Decorative background shield pattern */}
        <div className="tw:absolute tw:-right-8 tw:-bottom-12 tw:text-white/5 tw:pointer-events-none" aria-hidden="true">
          <svg width="220" height="220" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
      </section>

      {/* Protection Portfolio Summary Metrics Grid */}
      <section className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-4" aria-label="Protection Summary">
        
        {/* Metric 1: Total Sum Assured */}
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs tw:transition-all tw:hover:shadow-xs">
          <div className="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-500">
              Total Protection Value
            </span>
            <div className="tw:w-8 tw:h-8 tw:rounded-xl tw:bg-emerald-50 tw:text-emerald-600 tw:flex tw:items-center tw:justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </div>
          <div className="tw:text-2xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
            {totalSumAssured > 0
              ? policyMoney(totalSumAssured.toFixed(2), 'VND')
              : policies.length > 0
                ? policyMoney(policies[0].sumAssured, policies[0].currency)
                : '1,000,000,000 VND'}
          </div>
          <p className="tw:text-xs tw:text-slate-500 tw:mt-1">
            Total active life & critical illness coverage
          </p>
        </div>

        {/* Metric 2: Active Policies */}
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs tw:transition-all tw:hover:shadow-xs">
          <div className="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-500">
              In-Force Policies
            </span>
            <div className="tw:w-8 tw:h-8 tw:rounded-xl tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div className="tw:text-2xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
            {activePolicies.length > 0 ? activePolicies.length : policies.length > 0 ? policies.length : 1}
            <span className="tw:text-sm tw:font-semibold tw:text-slate-500 tw:ml-1">
              active {policies.length === 1 ? 'contract' : 'contracts'}
            </span>
          </div>
          <p className="tw:text-xs tw:text-slate-500 tw:mt-1">
            Fully guaranteed policy benefits
          </p>
        </div>

        {/* Metric 3: Next Premium Due */}
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs tw:transition-all tw:hover:shadow-xs">
          <div className="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-500">
              Next Premium Schedule
            </span>
            <div className="tw:w-8 tw:h-8 tw:rounded-xl tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
          <div className="tw:text-2xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
            {upcomingDueDate ? policyDate(upcomingDueDate) : 'Annual Schedule'}
          </div>
          <p className="tw:text-xs tw:text-slate-500 tw:mt-1">
            Standard 60-day grace period applies
          </p>
        </div>

      </section>

      {/* Two-Column Area: Financial Advisor & Quick Actions */}
      <div className="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-6">
        
        {/* Left 2 Cols: Quick Actions & Featured Solutions */}
        <div className="tw:lg:col-span-2 tw:space-y-6">
          
          {/* Quick Actions Shortcuts */}
          <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs">
            <h2 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:mb-4">
              Customer Quick Services
            </h2>
            <div className="tw:grid tw:grid-cols-2 tw:sm:grid-cols-4 tw:gap-3">
              
              <button
                type="button"
                onClick={() => onNavigateTab('policies')}
                className="tw:flex tw:flex-col tw:items-center tw:p-3.5 tw:rounded-2xl tw:border tw:border-slate-200/70 tw:bg-slate-50/60 tw:hover:bg-emerald-50/60 tw:hover:border-emerald-200 tw:transition-all tw:text-center tw:cursor-pointer tw:group"
              >
                <div className="tw:w-10 tw:h-10 tw:rounded-xl tw:bg-emerald-100/70 tw:text-emerald-700 tw:flex tw:items-center tw:justify-center tw:mb-2 tw:group-hover:scale-105 tw:transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span className="tw:text-xs tw:font-bold tw:text-slate-800">My Policies</span>
                <span className="tw:text-[10px] tw:text-slate-500 tw:mt-0.5">Contracts & PDF</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('products')}
                className="tw:flex tw:flex-col tw:items-center tw:p-3.5 tw:rounded-2xl tw:border tw:border-slate-200/70 tw:bg-slate-50/60 tw:hover:bg-blue-50/60 tw:hover:border-blue-200 tw:transition-all tw:text-center tw:cursor-pointer tw:group"
              >
                <div className="tw:w-10 tw:h-10 tw:rounded-xl tw:bg-blue-100/70 tw:text-blue-700 tw:flex tw:items-center tw:justify-center tw:mb-2 tw:group-hover:scale-105 tw:transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <span className="tw:text-xs tw:font-bold tw:text-slate-800">Explore Plans</span>
                <span className="tw:text-[10px] tw:text-slate-500 tw:mt-0.5">Life & Health</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('chat')}
                className="tw:flex tw:flex-col tw:items-center tw:p-3.5 tw:rounded-2xl tw:border tw:border-slate-200/70 tw:bg-slate-50/60 tw:hover:bg-purple-50/60 tw:hover:border-purple-200 tw:transition-all tw:text-center tw:cursor-pointer tw:group"
              >
                <div className="tw:w-10 tw:h-10 tw:rounded-xl tw:bg-purple-100/70 tw:text-purple-700 tw:flex tw:items-center tw:justify-center tw:mb-2 tw:group-hover:scale-105 tw:transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span className="tw:text-xs tw:font-bold tw:text-slate-800">AI Assistant</span>
                <span className="tw:text-[10px] tw:text-slate-500 tw:mt-0.5">24/7 Guidance</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('account')}
                className="tw:flex tw:flex-col tw:items-center tw:p-3.5 tw:rounded-2xl tw:border tw:border-slate-200/70 tw:bg-slate-50/60 tw:hover:bg-teal-50/60 tw:hover:border-teal-200 tw:transition-all tw:text-center tw:cursor-pointer tw:group"
              >
                <div className="tw:w-10 tw:h-10 tw:rounded-xl tw:bg-teal-100/70 tw:text-teal-700 tw:flex tw:items-center tw:justify-center tw:mb-2 tw:group-hover:scale-105 tw:transition-transform">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span className="tw:text-xs tw:font-bold tw:text-slate-800">Security</span>
                <span className="tw:text-[10px] tw:text-slate-500 tw:mt-0.5">Password & Info</span>
              </button>

            </div>
          </div>

          {/* Featured Insurance Plans */}
          <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs">
            <div className="tw:flex tw:items-center tw:justify-between tw:mb-4">
              <div>
                <h2 className="tw:text-sm tw:font-bold tw:text-slate-900">
                  Featured Insurance Solutions
                </h2>
                <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
                  Official coverage plans with endorsed policy conditions and guides
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('products')}
                className="tw:text-xs tw:font-semibold tw:text-emerald-700 tw:hover:underline tw:cursor-pointer"
              >
                View all plans →
              </button>
            </div>

            <div className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
              {products.slice(0, 2).map(product => (
                <div
                  key={product.id}
                  className="tw:rounded-2xl tw:border tw:border-slate-200/70 tw:p-4 tw:bg-slate-50/50 tw:flex tw:flex-col tw:justify-between tw:gap-3"
                >
                  <div>
                    <div className="tw:flex tw:items-center tw:justify-between tw:mb-1.5">
                      <span className="tw:rounded-md tw:bg-emerald-50 tw:border tw:border-emerald-200/60 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold tw:text-emerald-800">
                        {product.productCode}
                      </span>
                      <span className="tw:text-[10px] tw:text-slate-500">Official Solution</span>
                    </div>
                    <h3 className="tw:text-xs tw:font-bold tw:text-slate-900 tw:mb-1">
                      {product.name}
                    </h3>
                    <p className="tw:text-[11px] tw:text-slate-600 tw:line-clamp-2">
                      {product.summary || 'Comprehensive life insurance and critical illness protection designed for family peace of mind.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('products')}
                    className="tw:w-full tw:text-center tw:py-2 tw:rounded-xl tw:bg-white tw:border tw:border-slate-200 tw:text-xs tw:font-semibold tw:text-slate-700 tw:hover:bg-slate-50 tw:transition-colors tw:cursor-pointer"
                  >
                    Explore Details & Terms
                  </button>
                </div>
              ))}
              {products.length === 0 && (
                <div className="tw:col-span-2 tw:text-center tw:py-6 tw:text-xs tw:text-slate-500">
                  Loading available insurance solutions…
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right 1 Col: Assigned Financial Advisor Card */}
        <div className="tw:space-y-6">
          <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs">
            <span className="tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-900">
              ASSIGNED SUPPORT STAFF
            </span>

            {staff && assignmentStatus === 'ASSIGNED' ? (
              <div className="tw:mt-4 tw:space-y-4">
                <div className="tw:flex tw:items-center tw:gap-3.5">
                  <div className="tw:w-12 tw:h-12 tw:rounded-full tw:bg-gradient-to-tr tw:from-emerald-700 tw:to-teal-600 tw:text-white tw:flex tw:items-center tw:justify-center tw:text-sm tw:font-bold tw:shadow-xs">
                    {staff.fullName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <h3 className="tw:text-sm tw:font-bold tw:text-slate-900">
                      {staff.fullName}
                    </h3>
                    <p className="tw:text-xs tw:text-slate-500">
                      {staff.department || 'AegisLife Customer Support & Operations'}
                    </p>
                  </div>
                </div>

                <div className="tw:rounded-xl tw:bg-slate-50 tw:p-3 tw:space-y-2 tw:text-xs tw:border tw:border-slate-100">
                  <div className="tw:flex tw:items-center tw:justify-between">
                    <span className="tw:text-slate-500">Email:</span>
                    <span className="tw:font-medium tw:text-slate-800">{staff.email}</span>
                  </div>
                  <div className="tw:flex tw:items-center tw:justify-between">
                    <span className="tw:text-slate-500">Phone:</span>
                    <span className="tw:font-medium tw:text-slate-800">{staff.phone || '1800-6868'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateTab('chat')}
                  className="tw:w-full tw:flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-emerald-600 tw:px-4 tw:py-2.5 tw:text-xs tw:font-bold tw:text-white tw:shadow-xs tw:hover:bg-emerald-500 tw:transition-colors tw:cursor-pointer"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Message Staff</span>
                </button>
              </div>
            ) : (
              <div className="tw:mt-4 tw:rounded-xl tw:bg-slate-50 tw:p-4 tw:text-center">
                <p className="tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Customer Care Concierge
                </p>
                <p className="tw:text-[11px] tw:text-slate-500 tw:leading-relaxed tw:mb-3">
                  {assignmentStatus === 'STAFF_UNAVAILABLE'
                    ? 'Your assigned staff is temporarily unavailable. Our support team is standing by to assist you.'
                    : 'Our customer support team is ready to assist you with any policy or claim question.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateTab('chat')}
                  className="tw:w-full tw:rounded-xl tw:bg-slate-900 tw:px-3 tw:py-2 tw:text-xs tw:font-semibold tw:text-white tw:hover:bg-slate-800 tw:transition-colors tw:cursor-pointer"
                >
                  Contact Support Team
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

