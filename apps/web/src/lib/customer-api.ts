import { coreRequest } from './auth-api';

type CustomerSummary = { id: string; accountCode: string; fullName: string; email: string | null; phone: string | null; status: 'ACTIVE' | 'LOCKED' };
export type Customer = Omit<CustomerSummary, 'email'> & { email: string } & { birth: string | null; address: string | null };
export type OwnProfile = { customer: Customer; assignmentStatus: 'ASSIGNED' | 'UNASSIGNED' | 'STAFF_UNAVAILABLE';
  staff: { id: string; fullName: string; department: string | null; email: string | null; phone: string | null } | null };
export type StaffCustomer = CustomerSummary & { birthYear: number | null; provinceCity: string | null };
export type CustomerList = { items: CustomerSummary[]; total: number; page: number; pageSize: number };
export const ownProfile = (signal: AbortSignal) => coreRequest<OwnProfile>('customers/me', { signal });
export const assignedCustomers = (page: number, signal: AbortSignal, search = '') => {
  const query = new URLSearchParams({ page: String(page), pageSize: '10' });
  if (search) query.set('search', search);
  return coreRequest<CustomerList>(`staff/customers?${query}`, { signal });
};
export const assignedCustomer = (id: string, signal: AbortSignal) => coreRequest<{ customer: StaffCustomer }>(`staff/customers/${encodeURIComponent(id)}`, { signal });

export const revealCustomerContact = (id: string, field: 'email' | 'phone', csrfToken: string, signal: AbortSignal) =>
  coreRequest<{ customerId: string; field: 'email' | 'phone'; value: string | null }>(`staff/customers/${encodeURIComponent(id)}/contact-reveal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ field }), signal,
  });
