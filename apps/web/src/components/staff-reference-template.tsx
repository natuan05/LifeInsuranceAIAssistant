// Structural transcription of the three user-supplied attachment files. No sample customer data.
import Link from 'next/link';
import type { ReactNode } from 'react';
export function StaffReferenceTemplate({slots,active,panel,collapsed,detailsOpen,onClick}: {slots:Record<string,ReactNode>;active:string;panel:string;collapsed:boolean;detailsOpen:boolean;onClick:React.MouseEventHandler<HTMLDivElement>}) {
return <div className="reference-template" onClick={onClick}>
<div className="app-canvas">
<div className="inbox-window">
<aside className={"inbox-nav-col " + (collapsed ? "collapsed" : "")} id="sidebar">
<div className="nav-col-header">
<div className="brand-dropdown-wrap" title="AegisLife Life Insurance Support Portal">
<svg className="brand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z">
</path>
</svg>
<span className="brand-title">{"AegisLife"}</span>
</div>
<div className="nav-header-actions">
<button className="nav-icon-btn" id="toggle-sidebar" title="Collapse / Expand sidebar">
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<rect x="3" y="3" width="18" height="18" rx="2">
</rect>
<line x1="9" y1="3" x2="9" y2="21">
</line>
<polyline points="15 9 12 12 15 15">
</polyline>
</svg>
</button>
</div>
</div>
<div className="nav-search-wrap">
<div className="nav-search-box">
<svg className="search-glass" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
<circle cx="11" cy="11" r="7">
</circle>
<line x1="21" y1="21" x2="16.5" y2="16.5">
</line>
</svg>
<input disabled type="text" id="global-search" placeholder="Search..." autoComplete="off" />
</div>
</div>
<div className="nav-scroll-area">
<div className="nav-group">{slots.customerNav}<div className="nav-group-title">{"INBOXES"}</div>
<Link href="/staff/inbox?filter=all" className={"nav-item-btn " + (active === "all" ? "active" : "")} data-category="all" id="nav-item-all" title="All conversations">
<div className="nav-item-left">
<svg className="nav-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2">
</path>
<circle cx="9" cy="7" r="4">
</circle>
<path d="M23 21v-2a4 4 0 0 0-3-3.87">
</path>
<path d="M16 3.13a4 4 0 0 1 0 7.75">
</path>
</svg>
<span className="nav-item-label">{"All"}</span>
</div>
</Link>
<Link href="/staff/inbox?filter=request" className={"nav-item-btn " + (active === "request" ? "active" : "")} data-category="request" id="nav-item-requests" title="Requests queue needing staff acceptance">
<div className="nav-item-left">
<svg className="nav-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2">
</polygon>
</svg>
<span className="nav-item-label">{"Requests"}</span>
</div>
</Link>
<Link href="/staff/inbox?filter=recent" className={"nav-item-btn " + (active === "recent" ? "active" : "")} data-category="recent" id="nav-item-recents" title="Assigned / Active conversations">
<div className="nav-item-left">
<svg className="nav-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z">
</path>
</svg>
<span className="nav-item-label">{"Active"}</span>
</div>
</Link>
<Link href="/staff/inbox?filter=new" className={"nav-item-btn " + (active === "new" ? "active" : "")} data-category="new" id="nav-item-new" title="Newly issued policies">
<div className="nav-item-left">
<svg className="nav-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z">
</path>
<polyline points="9 12 11 14 15 10">
</polyline>
</svg>
<span className="nav-item-label">{"New"}</span>
</div>
</Link>
<Link href="/staff/tickets" className={"nav-item-btn " + (active === "tickets" ? "active" : "")} data-category="tickets" id="btn-sidebar-tickets" title="Track Tickets & Requests">
<div className="nav-item-left">
<svg className="nav-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2">
</path>
<rect x="8" y="2" width="8" height="4" rx="1" ry="1">
</rect>
<line x1="9" y1="12" x2="15" y2="12">
</line>
<line x1="9" y1="16" x2="13" y2="16">
</line>
</svg>
<span className="nav-item-label">{"Tickets"}</span>
</div>
</Link>
</div>
<div className="nav-group">
<div className="nav-group-title">{"TOOLS"}</div>
<Link href="/staff/policies" className={"nav-item-btn " + (active === "lookup" ? "active" : "")} id="nav-item-policy-lookup" data-mode="policy-lookup" title="Search and inspect all insurance policies">
<div className="nav-item-left">
<svg className="nav-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="11" cy="11" r="8">
</circle>
<line x1="21" y1="21" x2="16.65" y2="16.65">
</line>
</svg>
<span className="nav-item-label">{"Policy Lookup"}</span>
</div>
</Link>
</div>
</div>{slots.accountMenu}</aside>
{slots.customerDirectory}<div className={"workspace-panes-wrapper " + (active === "lookup" || active === "customers" || active === "tickets" || active === "account" ? "hidden" : "")} id="workspace-panes">
<section className="conversation-list-col" id="conversation-list-col">
<div className="col2-header">
<div className="col2-title-row">
<h2 className="col2-heading" id="col2-section-title">{slots.sectionTitle}</h2>
</div>
<div className="col2-filter-row">{slots.filters}</div>
<div className="col2-search-wrap">
<svg className="search-glass" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<circle cx="11" cy="11" r="7">
</circle>
<line x1="21" y1="21" x2="16.5" y2="16.5">
</line>
</svg>
<input disabled type="text" id="sidebar-cust-search" placeholder="Search conversations..." autoComplete="off" />
</div>
</div>
<div className="col2-cards-container" id="col2-customer-list">{slots.list}</div>
</section>
<section className="chat-workspace-col" id="chat-workspace-col">
<header className="chat-top-header">
<div className="chat-header-left">
<div className="chat-header-avatar-box">{slots.avatar}</div>
<div className="chat-header-text">
<div className="chat-header-title-row">
<h2 className="chat-header-name" id="chat-header-cust-name">{slots.customerName}</h2>

</div>
</div>
</div>
<div className="chat-header-actions">
<button className="top-action-btn takeover-pill active" disabled id="btn-takeover" title="Toggle Live Takeover Mode">
<span className="live-dot">
</span>
<span className="takeover-txt">{"Takeover"}</span>
</button>
</div>
</header>
<div className="chat-flow-container" id="chat-flow">
<div className="chat-flow-inner" id="chat-flow-inner">{slots.transcript}</div>
</div>
<div className="chat-composer-wrapper">
<div className="chat-composer-box">
<textarea disabled id="chat-message-input" rows={2} placeholder="Type your response to the customer (Press Enter to send)..." autoComplete="off">
</textarea>
<div className="composer-action-bar">
<div className="composer-tools-left">
<button className="tool-btn" disabled id="btn-macro-popup" title="Quick response templates">
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<rect x="4" y="4" width="16" height="16" rx="2">
</rect>
<line x1="9" y1="9" x2="15" y2="9">
</line>
<line x1="9" y1="13" x2="15" y2="13">
</line>
<line x1="9" y1="17" x2="12" y2="17">
</line>
</svg>
<span>{"Templates"}</span>
</button>
<button className="tool-btn" title="Attach documents">
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48">
</path>
</svg>
</button>
</div>
<div className="composer-tools-right">
<span className="send-shortcut-hint">{"Enter to send"}</span>
<button className="btn-send-message" disabled id="btn-send-chat" title="Send message (Enter)">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
<line x1="22" y1="2" x2="11" y2="13">
</line>
<polygon points="22 2 15 22 11 13 2 9 22 2">
</polygon>
</svg>
<span>{"Send"}</span>
</button>
</div>
</div>
</div>
</div>
</section>
<nav className="right-panel-rail" id="right-panel-rail" aria-label="Right Panel View Switcher">
<div className="rail-top-action">
<button className="rail-btn rail-btn-toggle" id="btn-toggle-details" title="Collapse / Expand Details Panel">
<svg className="rail-toggle-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<rect x="3" y="3" width="18" height="18" rx="2">
</rect>
<line x1="15" y1="3" x2="15" y2="21">
</line>
</svg>
</button>
</div>
<div className="rail-divider">
</div>
<div className="rail-views-group">
<button className={"rail-btn " + (detailsOpen && panel === "details" ? "active" : "")} aria-pressed={detailsOpen && panel === "details"} id="rail-btn-details" data-panel="details" title="Case Details & Customer Profile">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z">
</path>
<polyline points="14 2 14 8 20 8">
</polyline>
<line x1="16" y1="13" x2="8" y2="13">
</line>
<line x1="16" y1="17" x2="8" y2="17">
</line>
</svg>
</button>
<button className={"rail-btn " + (detailsOpen && panel === "agent" ? "active" : "")} aria-pressed={detailsOpen && panel === "agent"} id="rail-btn-agent" data-panel="agent" title="AI Agent Copilot & Knowledge RAG">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2">
</polygon>
</svg>
</button>
<button className={"rail-btn " + (detailsOpen && panel === "lookup" ? "active" : "")} aria-pressed={detailsOpen && panel === "lookup"} id="rail-btn-lookup" data-panel="lookup" title="Quick Policy Lookup">
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<circle cx="11" cy="11" r="8">
</circle>
<line x1="21" y1="21" x2="16.65" y2="16.65">
</line>
</svg>
</button>
</div>
</nav>
<aside className={"details-panel-col " + (detailsOpen ? "" : "collapsed")} id="right-panel-col">
<div className={"panel-view " + (panel === "details" ? "active" : "")} id="view-details">
<div className="details-header">
<h3 className="details-title">{"Case Details"}</h3>
<button className="details-close-btn" id="btn-close-details" title="Collapse Panel">
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<line x1="18" y1="6" x2="6" y2="18">
</line>
<line x1="6" y1="6" x2="18" y2="18">
</line>
</svg>
</button>
</div>{slots.details}</div>{slots.agent}{slots.lookup}</aside>
</div>
<section className={"full-lookup-portal-view " + (active === "lookup" ? "active" : "")} id="full-policy-lookup-view">
<header className="full-lookup-topbar">
<div className="topbar-left-group">
<button className="btn-return-inbox" id="btn-return-inbox" title="Return to Conversations Workspace">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
<line x1="19" y1="12" x2="5" y2="12">
</line>
<polyline points="12 19 5 12 12 5">
</polyline>
</svg>
<span>{"Back to Inbox"}</span>
</button>
<div className="topbar-divider">
</div>
<div className="full-lookup-title-box">
<h2 className="full-lookup-heading">{"Policy Explorer & Dossier"}</h2>
<span className="full-lookup-subheading">{"Search and review life insurance policies"}</span>
</div>
</div>

</header>
<div className="full-lookup-content">
<aside className="full-lookup-directory-pane">
<div className="full-lookup-search-wrap">
<div className="full-lookup-search-box">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
<circle cx="11" cy="11" r="7">
</circle>
<line x1="21" y1="21" x2="16.5" y2="16.5">
</line>
</svg>
<input disabled type="text" id="full-policy-search-input" placeholder="Search by Policy #, CCCD, phone, owner..." autoComplete="off" />
</div>
</div>
<div className="full-lookup-filter-pills" id="full-policy-status-filters">
<button disabled className="status-filter-pill active" data-filter="all">{"All"}</button>
<button disabled className="status-filter-pill" data-filter="In-Force">{"In-Force"}</button>
<button disabled className="status-filter-pill" data-filter="Grace Period">{"Grace Period"}</button>
<button disabled className="status-filter-pill" data-filter="Review">{"Review"}</button>
</div>
<div className="full-lookup-card-list" id="full-policy-card-list">{slots.policiesList}</div>
</aside>
<section className="full-lookup-dossier-pane" id="full-lookup-dossier-pane">{slots.policyDossier}</section>
</div>
</section>
</div>
</div>

</div>;
}
