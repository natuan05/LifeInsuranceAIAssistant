import { coreRequest } from './auth-api';

type CustomerSummary = { id: string; accountCode: string; fullName: string; email: string; phone: string | null; status: 'ACTIVE' | 'LOCKED' };
export type Customer = CustomerSummary & { birth: string | null; address: string | null };
export type OwnProfile = { customer: Customer; assignmentStatus: 'ASSIGNED' | 'UNASSIGNED' | 'STAFF_UNAVAILABLE';
  staff: { id: string; fullName: string; department: string | null; email: string; phone: string | null } | null };
export type CustomerList = { items: CustomerSummary[]; total: number; page: number; pageSize: number };
export const ownProfile = (signal: AbortSignal) => coreRequest<OwnProfile>('customers/me', { signal });
export const assignedCustomers = (page: number, signal: AbortSignal) => coreRequest<CustomerList>(`staff/customers?page=${page}&pageSize=10`, { signal });
export const assignedCustomer = (id: string, signal: AbortSignal) => coreRequest<{ customer: Customer }>(`staff/customers/${encodeURIComponent(id)}`, { signal });
