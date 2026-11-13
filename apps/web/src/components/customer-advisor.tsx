'use client';

import type { Actor } from '@/lib/auth-api';
import type { OwnProfile } from '@/lib/customer-api';
import type { CustomerTab } from './customer-header';

export function CustomerAdvisor({
  actor,
  profile,
  onNavigateTab,
}: {
  actor: Actor;
  profile: OwnProfile | null;
  onNavigateTab: (tab: CustomerTab) => void;
}) {
  const staff = profile?.staff;
  const assignmentStatus = profile?.assignmentStatus ?? 'UNASSIGNED';
  const isAssigned = assignmentStatus === 'ASSIGNED' && Boolean(staff);
  const currentStaff = isAssigned ? staff : null;
  const isUnavailable = assignmentStatus === 'STAFF_UNAVAILABLE';

  return (
    <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Top Header Card */}
      <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs">
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4">
          <div>
            <h2 className="tw:text-lg tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
              Assigned Support Specialist
            </h2>
            <p className="tw:text-xs tw:text-slate-500 tw:mt-1">
              Your dedicated specialist for policy management, claims, and coverage inquiries
            </p>
          </div>
          <div>
            {isAssigned ? (
              <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200">
                <span className="tw:w-2 tw:h-2 tw:rounded-full tw:bg-emerald-500 tw:animate-pulse" />
                Online (Available)
              </span>
            ) : isUnavailable ? (
              <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200">
                Temporarily Unavailable
              </span>
            ) : (
              <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-slate-100 tw:text-slate-600 tw:border tw:border-slate-200">
                Unassigned
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="tw:grid tw:grid-cols-1 tw:lg:grid-cols-12 tw:gap-6">
        
        {/* Left Column: Advisor Card (7 cols) */}
        <div className="tw:lg:col-span-7 tw:space-y-6">
          <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs tw:flex tw:flex-col tw:items-center tw:text-center">
            
            {/* Large Avatar */}
            <div className="tw:relative tw:w-20 tw:h-20 tw:rounded-full tw:bg-gradient-to-br tw:from-slate-900 tw:to-slate-800 tw:text-white tw:text-2xl tw:font-extrabold tw:flex tw:items-center tw:justify-center tw:shadow-md tw:mb-4">
              <span>{currentStaff ? currentStaff.fullName.split(' ').map(w => w[0]).slice(0, 2).join('') : 'SA'}</span>
              {currentStaff && (
                <span className="tw:absolute tw:bottom-0 tw:right-0 tw:w-4 tw:h-4 tw:rounded-full tw:bg-emerald-500 tw:border-2 tw:border-white" />
              )}
            </div>

            {/* Name & Title */}
            <h3 className="tw:text-xl tw:font-extrabold tw:text-slate-900">
              {currentStaff ? currentStaff.fullName : 'Synthetic Staff A'}
            </h3>
            <p className="tw:text-xs tw:font-semibold tw:text-emerald-700 tw:mt-0.5">
              Dedicated Support Specialist
            </p>
            <p className="tw:text-[11px] tw:text-slate-400 tw:mt-0.5">
              {currentStaff ? (currentStaff.department ?? 'AegisLife Customer Support & Operations') : 'AegisLife Customer Support & Operations'}
            </p>

            {/* Credentials Grid */}
            <div className="tw:grid tw:grid-cols-2 tw:sm:grid-cols-4 tw:gap-3 tw:w-full tw:mt-6 tw:mb-6">
              <div className="tw:bg-slate-50 tw:border tw:border-slate-200/70 tw:rounded-xl tw:p-3 tw:text-left">
                <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">Staff ID</span>
                <span className="tw:block tw:text-xs tw:font-bold tw:text-slate-900 tw:mt-0.5">
                  {currentStaff ? (currentStaff.id.startsWith('STF') ? currentStaff.id : 'STF-000001') : 'STF-000001'}
                </span>
              </div>
              <div className="tw:bg-slate-50 tw:border tw:border-slate-200/70 tw:rounded-xl tw:p-3 tw:text-left">
                <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">Experience</span>
                <span className="tw:block tw:text-xs tw:font-bold tw:text-slate-900 tw:mt-0.5">6+ years</span>
              </div>
              <div className="tw:bg-slate-50 tw:border tw:border-slate-200/70 tw:rounded-xl tw:p-3 tw:text-left">
                <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">License</span>
                <span className="tw:block tw:text-xs tw:font-bold tw:text-slate-900 tw:mt-0.5">MoF Certified</span>
              </div>
              <div className="tw:bg-slate-50 tw:border tw:border-slate-200/70 tw:rounded-xl tw:p-3 tw:text-left">
                <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">Rating</span>
                <span className="tw:block tw:text-xs tw:font-bold tw:text-amber-600 tw:mt-0.5">★ 4.9 / 5.0</span>
              </div>
            </div>

            {/* Direct Contact List */}
            <div className="tw:w-full tw:space-y-2.5 tw:text-left tw:mb-6">
              <div className="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-slate-50/70 tw:border tw:border-slate-200/70 tw:rounded-xl">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400 tw:shrink-0">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <div className="tw:min-w-0 tw:flex-1">
                  <div className="tw:text-[10px] tw:text-slate-400 tw:font-medium">Official Support Email</div>
                  <div className="tw:text-xs tw:font-semibold tw:text-slate-900 tw:truncate">
                    {currentStaff ? currentStaff.email : 'Not available'}
                  </div>
                </div>
              </div>

              <div className="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-slate-50/70 tw:border tw:border-slate-200/70 tw:rounded-xl">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400 tw:shrink-0">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <div className="tw:min-w-0 tw:flex-1">
                  <div className="tw:text-[10px] tw:text-slate-400 tw:font-medium">Direct Phone Line</div>
                  <div className="tw:text-xs tw:font-semibold tw:text-slate-900">
                    {currentStaff ? (currentStaff.phone ?? '1800-6868') : '1800-6868'}
                  </div>
                </div>
              </div>

              <div className="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-slate-50/70 tw:border tw:border-slate-200/70 tw:rounded-xl">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400 tw:shrink-0">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <div className="tw:min-w-0 tw:flex-1">
                  <div className="tw:text-[10px] tw:text-slate-400 tw:font-medium">Operations Center</div>
                  <div className="tw:text-xs tw:font-semibold tw:text-slate-900">
                    Floor 12, AegisLife Tower, 123 Le Loi, Ben Nghe, District 1, HCMC
                  </div>
                </div>
              </div>

              <div className="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-slate-50/70 tw:border tw:border-slate-200/70 tw:rounded-xl">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400 tw:shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className="tw:min-w-0 tw:flex-1">
                  <div className="tw:text-[10px] tw:text-slate-400 tw:font-medium">Support Hours</div>
                  <div className="tw:text-xs tw:font-semibold tw:text-slate-900">
                    08:30 - 18:00 (Monday to Friday)
                  </div>
                </div>
              </div>
            </div>

            {/* Direct Actions */}
            <div className="tw:w-full tw:space-y-2.5">
              <button
                type="button"
                onClick={() => onNavigateTab('chat')}
                className="tw:w-full tw:py-2.5 tw:px-4 tw:rounded-xl tw:bg-emerald-600 tw:hover:bg-emerald-700 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center tw:gap-2 tw:shadow-xs tw:transition-all tw:cursor-pointer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Message Support Specialist</span>
              </button>

              <div className="tw:flex tw:gap-2.5 tw:w-full">
                <button
                  type="button"
                  onClick={() => alert(`Callback request sent to ${currentStaff ? currentStaff.fullName : 'Synthetic Staff A'}. You will receive a call within 30 minutes.`)}
                  className="tw:flex-1 tw:py-2 tw:px-3 tw:rounded-xl tw:bg-slate-100 tw:hover:bg-slate-200/80 tw:text-slate-700 tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer"
                >
                  Request Callback (30m)
                </button>
                <button
                  type="button"
                  onClick={() => alert('Consultation request recorded. Our customer service team will confirm your appointment via email.')}
                  className="tw:flex-1 tw:py-2 tw:px-3 tw:rounded-xl tw:bg-slate-100 tw:hover:bg-slate-200/80 tw:text-slate-700 tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer"
                >
                  Schedule Consultation
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Managing Policy & Scope (5 cols) */}
        <div className="tw:lg:col-span-5 tw:space-y-6">
          
          {/* Managing Policy Card */}
          <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs">
            <h3 className="tw:text-sm tw:font-extrabold tw:text-slate-900 tw:mb-3">
              Assigned Insurance Policy
            </h3>
            <div className="tw:bg-slate-50 tw:border tw:border-slate-200/70 tw:rounded-xl tw:p-4">
              <div className="tw:flex tw:items-center tw:justify-between tw:mb-2">
                <span className="tw:font-mono tw:text-xs tw:font-bold tw:bg-white tw:border tw:border-slate-200 tw:px-2 tw:py-0.5 tw:rounded-md tw:text-slate-700">
                  #DEV-POL-A-001
                </span>
                <span className="tw:text-[11px] tw:font-bold tw:text-emerald-700 tw:bg-emerald-50 tw:px-2 tw:py-0.5 tw:rounded-full">
                  ● In Force
                </span>
              </div>
              <div className="tw:text-sm tw:font-bold tw:text-slate-900 tw:mb-1">
                An Tam Tron Doi - Simulation
              </div>
              <div className="tw:text-xs tw:text-slate-500 tw:space-y-1 tw:mt-2">
                <div>Policyholder: <strong>{actor.fullName}</strong></div>
                <div>Sum Assured: <strong>1,000,000,000 VND</strong></div>
                <div>Next Premium Due: <strong className="tw:text-amber-700">Jan 15, 2025</strong></div>
              </div>
              <div className="tw:mt-4 tw:pt-3 tw:border-t tw:border-slate-200">
                <button
                  type="button"
                  onClick={() => onNavigateTab('policies')}
                  className="tw:text-xs tw:font-bold tw:text-blue-600 tw:hover:text-blue-700 tw:inline-flex tw:items-center tw:gap-1 tw:cursor-pointer"
                >
                  View Policy Details →
                </button>
              </div>
            </div>
          </div>

          {/* Scope of Support */}
          <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs">
            <h3 className="tw:text-sm tw:font-extrabold tw:text-slate-900 tw:mb-4">
              Scope of Support &amp; Responsibilities
            </h3>
            <div className="tw:space-y-3.5 tw:text-xs">
              <div className="tw:flex tw:items-start tw:gap-3">
                <span className="tw:w-5 tw:h-5 tw:rounded-full tw:bg-emerald-100 tw:text-emerald-800 tw:font-bold tw:flex tw:items-center tw:justify-center tw:text-[11px] tw:shrink-0 tw:mt-0.5">
                  1
                </span>
                <div>
                  <strong className="tw:text-slate-900 tw:block">Policy Benefits &amp; Schedule Guidance:</strong>
                  <span className="tw:text-slate-500 tw:mt-0.5 tw:block">
                    In-depth consultation on death, disability, hospitalization protections, and periodic savings cash flows.
                  </span>
                </div>
              </div>

              <div className="tw:flex tw:items-start tw:gap-3">
                <span className="tw:w-5 tw:h-5 tw:rounded-full tw:bg-emerald-100 tw:text-emerald-800 tw:font-bold tw:flex tw:items-center tw:justify-center tw:text-[11px] tw:shrink-0 tw:mt-0.5">
                  2
                </span>
                <div>
                  <strong className="tw:text-slate-900 tw:block">Hospitalization Claims Assistance (e-Claim):</strong>
                  <span className="tw:text-slate-500 tw:mt-0.5 tw:block">
                    Guidance on hospital discharge certificates, medical cost breakdown, and claim review with assessment underwriters.
                  </span>
                </div>
              </div>

              <div className="tw:flex tw:items-start tw:gap-3">
                <span className="tw:w-5 tw:h-5 tw:rounded-full tw:bg-emerald-100 tw:text-emerald-800 tw:font-bold tw:flex tw:items-center tw:justify-center tw:text-[11px] tw:shrink-0 tw:mt-0.5">
                  3
                </span>
                <div>
                  <strong className="tw:text-slate-900 tw:block">Policyholder Profile &amp; Administrative Updates:</strong>
                  <span className="tw:text-slate-500 tw:mt-0.5 tw:block">
                    Assistance with updating national identity documents, contact numbers, residential address, or adding beneficiaries.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Compliance Assurance Box */}
          <div className="tw:bg-emerald-50/70 tw:border tw:border-emerald-200/80 tw:rounded-2xl tw:p-4 tw:text-xs tw:text-emerald-950">
            <div className="tw:flex tw:items-center tw:gap-2 tw:font-bold tw:text-emerald-800 tw:mb-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Confidentiality &amp; Policyholder Rights</span>
            </div>
            <p className="tw:text-emerald-800/90 tw:leading-relaxed">
              All communications and medical records shared with your specialist are safeguarded under AegisLife Enterprise Security standards.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
