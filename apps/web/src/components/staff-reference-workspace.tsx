 'use client';
import { realtimeEvent } from '@/lib/realtime';
import Link from 'next/link';
import { useRouter,usePathname,useSearchParams,useParams } from 'next/navigation';
import { useEffect,useRef,useState,type MouseEvent,type ReactNode } from 'react';
import { AuthError,type Actor } from '@/lib/auth-api';
import { assignedCustomer,assignedCustomers,type Customer,type CustomerList } from '@/lib/customer-api';
import { AccountMenu } from './staff-account-menu';
import { StaffCustomerDirectory } from './staff-customer-directory';
import { StaffReferenceTemplate } from './staff-reference-template';

export function StaffReferenceWorkspace({actor,pending,error:sessionError,onSignOut,account=false,accountContent}:{actor:Actor;pending:boolean;error:string;onSignOut:()=>void;account?:boolean;accountContent?:ReactNode}) {
const pathname=usePathname();
const search=useSearchParams();
const params=useParams<{customerId?:string;conversationId?:string;policyId?:string;ticketId?:string}>();
const inboxFilter=search.get('filter')||'all';
const active=account?'account':pathname.startsWith('/staff/customers')?'customers':pathname.startsWith('/staff/policies')?'lookup':pathname.startsWith('/staff/tickets')?'tickets':(['all','request','recent','new'].includes(inboxFilter)?inboxFilter:'all');
const [panel,setPanel]=useState('details');
const [collapsed,setCollapsed]=useState(false);
const [detailsOpen,setDetailsOpen]=useState(true);
const [dismissed,setDismissed]=useState(false);
  const router = useRouter();
  const rawPage=search.get('page')||'1';
  const page=/^\d+$/.test(rawPage)&&Number(rawPage)>=1&&Number(rawPage)<=100000?Number(rawPage):1;
  const selected=params.customerId??null;
  const [revision,setRevision] = useState(0);
  const [list,setList] = useState<CustomerList | null>(null);
  const [detail,setDetail] = useState<Customer | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const browsingCustomers=active==='customers';
  const loadedKey=useRef('');
  useEffect(()=>{
    let live=true;const controller=new AbortController();
    async function load(){
      const key=JSON.stringify([actor.id,page,selected,browsingCustomers]);
      if(loadedKey.current!==key){setLoading(true);setList(null);setDetail(null);}
      setError('');
      if(!browsingCustomers){loadedKey.current='';setLoading(false);return;}
      try{
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);
        const customers=await assignedCustomers(page,signal);
        const profile=selected?await assignedCustomer(selected,signal):null;
        if(live){loadedKey.current=key;setList(customers);setDetail(profile?.customer??null);}
      }catch(failure){
        if(!live)return;
        if(failure instanceof AuthError&&[401,403,404].includes(failure.status)){setList(null);setDetail(null);loadedKey.current='';}
        if(failure instanceof AuthError&&failure.status===401)router.replace('/staff/login');
        setError(failure instanceof AuthError&&failure.status===404?'This customer is unavailable or is no longer assigned to you.':failure instanceof AuthError&&failure.status===403?'You do not have permission to view this content.':'Unable to load data. Please try again.');
      }finally{if(live)setLoading(false);}
    }
    void load();return()=>{live=false;controller.abort();};
  },[actor.id,page,selected,revision,router,browsingCustomers]);
  useEffect(()=>{
    const refresh=()=>setRevision(v=>v+1);
    window.addEventListener(realtimeEvent,refresh);
    return()=>window.removeEventListener(realtimeEvent,refresh);
  },[]);
  const unavailable=(text:string)=><p className="reference-empty">{text}</p>;
  const sectionTitle=({customers:'Customers',all:'All',request:'Requests',recent:'Active',new:'New',tickets:'Tickets',lookup:'Policy Lookup'} as Record<string,string>)[active];
  function click(event:MouseEvent<HTMLDivElement>){
    const element=event.target as Element;
    if(element.closest('.brand-dropdown-wrap')){setCollapsed(false);return;}
    const button=element.closest('button');if(!button)return;
    const category=button.getAttribute('data-category');if(category){router.push(category==='customers'?'/staff/customers':category==='tickets'?'/staff/tickets':`/staff/inbox?filter=${category}`);return;}
    const view=button.getAttribute('data-panel');if(view){setPanel(view);setDetailsOpen(true);return;}
    switch(button.id){
      case 'btn-return-inbox':router.push('/staff/inbox?filter=all');break;
      case 'toggle-sidebar':setCollapsed(v=>!v);break;
      case 'nav-item-policy-lookup':router.push('/staff/policies');break;
      case 'btn-toggle-details':setDetailsOpen(v=>!v);break;
      case 'btn-close-details':setDetailsOpen(false);break;
      case 'btn-close-agent':case 'btn-close-lookup':setPanel('details');break;
    }
  }
  const slots={
  customerDirectory:account?accountContent:active==='customers'?<StaffCustomerDirectory list={list} detail={detail} selected={selected} loading={loading} error={error} page={page} onSelect={id=>router.push(`/staff/customers/${encodeURIComponent(id)}${page>1?`?page=${page}`:''}`)} onBack={()=>router.push(`/staff/customers${page>1?`?page=${page}`:''}`)} onPage={p=>router.push(`/staff/customers?page=${p}`)}/>:active==='tickets'?<section className="customer-directory"><header className="customer-directory-header"><div><h1>{params.ticketId?'Ticket details':'Tickets'}</h1><p>Support requests assigned to you.</p></div></header><div className="customer-directory-content">{params.ticketId&&<Link href="/staff/tickets">Back to tickets</Link>}{unavailable('Ticket data is not connected yet.')}</div></section>:null,
  accountMenu:<AccountMenu actor={actor} pending={pending} onSignOut={onSignOut}/>,
  customerNav:<Link href="/staff/customers" className={'nav-item-btn '+(active==='customers'?'active':'')} data-category="customers"><span className="nav-item-left"><svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 8 0 0 1 16 0v4"/></svg><span className="nav-item-label">Customers</span></span></Link>,
  sectionTitle,filters:<><span className="col2-filter-pill">{active==='customers'?`${list?.total??'…'} customers`:'Not connected'}</span><button className="col2-filter-pill" disabled={loading} onClick={()=>setRevision(v=>v+1)}>Refresh</button></>,
  customerName:params.conversationId?'Conversation':'Support workspace',
  avatar:<span className="reference-avatar">{'A'}</span>,
  list:unavailable('Data is not connected yet: '+sectionTitle+'.'),
  transcript:<div className="reference-chat-empty"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 4h18v13H8l-5 4Z"/></svg><h2>No conversations yet</h2><p>{params.conversationId?'This conversation cannot be loaded until conversation data is connected.':'Messages will appear here once conversations are connected.'}</p></div>,
  details:<div className="details-scroll-body">{unavailable('Select a conversation to view related information.')}</div>,
  agent:<div className={'panel-view '+(panel==='agent'?'active':'')} id="view-agent"><div className="details-header"><h3 className="details-title">AI Copilot</h3></div>{unavailable('Copilot is not connected yet.')}</div>,
  lookup:<div className={'panel-view '+(panel==='lookup'?'active':'')} id="view-lookup"><div className="details-header"><h3 className="details-title">Quick Policy Lookup</h3></div>{unavailable('Policy lookup is not connected yet.')}</div>,policiesList:unavailable('The policy list is not connected yet.'),policyDossier:<>{params.policyId&&<div className="reference-empty"><Link href="/staff/policies">Back to policies</Link><h2>Policy details</h2></div>}{unavailable('Policy data is not connected yet.')}</>,
 };
 return <main className="staff-inbox reference-live">{sessionError&&<p role="alert" className="reference-empty">{sessionError}</p>}{actor.passwordChangeRecommended&&!dismissed&&<div className="password-notice"><span>We recommend changing your issued password when convenient. <Link href="/account#change-password">Change password</Link></span><button aria-label="Dismiss password reminder" onClick={()=>setDismissed(true)}>×</button></div>}<StaffReferenceTemplate slots={slots} active={active} panel={panel} collapsed={collapsed} detailsOpen={detailsOpen} onClick={click}/></main>;
}
