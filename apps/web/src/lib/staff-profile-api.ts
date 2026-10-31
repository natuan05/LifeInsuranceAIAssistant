import { coreRequest } from './auth-api';

export type StaffProfile = {
  id: string; accountCode: string; email: string; role: 'STAFF'; fullName: string;
  phone: string | null; department: string | null; updatedAt: string;
};
export const staffProfile = (signal?: AbortSignal) => coreRequest<{ staff: StaffProfile }>('staff/me', { signal });
export const updateStaffProfile = (input: { fullName: string; phone: string | null; expectedUpdatedAt: string }, csrfToken: string) =>
  coreRequest<{ staff: StaffProfile }>('staff/me', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  });
