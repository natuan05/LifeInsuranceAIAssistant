import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { AccountProvisioningService } from '../accounts/services/account-provisioning.service';
import { hashPassword, needsPasswordRehash, verifyPassword } from '../accounts/utils/password';

// Public synthetic fixture credential, deliberately shared in Git for LOCAL dev only.
export const sharedDevPassword = 'DevLocal-2026!';

export type DevAccountDefinition = { accountCode: string; email: string; role: 'STAFF' | 'CUSTOMER'; fullName: string; staffCode?: string };
export const devAccounts: readonly DevAccountDefinition[] = [
  { accountCode: 'STF-000001', email: 'staff.a@dev.example.invalid', role: 'STAFF', fullName: 'Synthetic Staff A' },
  { accountCode: 'STF-000002', email: 'staff.b@dev.example.invalid', role: 'STAFF', fullName: 'Synthetic Staff B' },
  { accountCode: 'CUS-000001', email: 'customer.a@dev.example.invalid', role: 'CUSTOMER', fullName: 'Synthetic Customer A', staffCode: 'STF-000001' },
  { accountCode: 'CUS-000002', email: 'customer.b@dev.example.invalid', role: 'CUSTOMER', fullName: 'Synthetic Customer B', staffCode: 'STF-000002' },
  { accountCode: 'CUS-000003', email: 'customer.unassigned@dev.example.invalid', role: 'CUSTOMER', fullName: 'Synthetic Customer Unassigned' },
] as const;

export type DevManifest = { version: 1; accounts: Array<{ accountCode: string; email: string; password: string }> };
export function newDevManifest(fixtures = devAccounts): DevManifest {
  return { version: 1, accounts: fixtures.map(account => ({ accountCode: account.accountCode, email: account.email, password: sharedDevPassword })) };
}
export function validateManifest(manifest: DevManifest, fixtures = devAccounts) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.accounts) || manifest.accounts.length !== fixtures.length) throw new Error('Invalid bootstrap manifest.');
  for (const fixture of fixtures) {
    const matches = manifest.accounts.filter(account => account.accountCode === fixture.accountCode && account.email === fixture.email);
    if (matches.length !== 1 || typeof matches[0].password !== 'string' || Array.from(matches[0].password).length < 6 || matches[0].password.length > 128) throw new Error('Invalid bootstrap manifest.');
  }
}
// One-time upgrade for the earlier random-password fixtures, only with proof that
// their original local credential is still in use. Never reset a changed password.
export async function upgradeLegacyDevPasswords(tx: Prisma.TransactionClient, legacy: DevManifest, fixtures = devAccounts) {
  validateManifest(legacy, fixtures);
  for (const fixture of fixtures) {
    await tx.$queryRaw`SELECT id FROM business.users WHERE account_code = ${fixture.accountCode} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { accountCode: fixture.accountCode } });
    if (!user || user.email !== fixture.email || user.role !== fixture.role || user.passwordChangedAt || !user.passwordChangeRecommended) continue;
    const owned = await tx.auditLog.findFirst({ where: { targetId: user.id, action: 'ACCOUNT_CREATED', operatorId: 'dev-bootstrap' } });
    const old = legacy.accounts.find(account => account.accountCode === fixture.accountCode)!;
    if (!owned || await verifyPassword(sharedDevPassword, user.passwordHash) || !await verifyPassword(old.password, user.passwordHash)) continue;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(sharedDevPassword) } });
    await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: 'dev-bootstrap', action: 'DEV_FIXTURE_PASSWORD_SHARED',
      targetType: 'User', targetId: user.id, outcome: 'SUCCESS', requestId: randomUUID() } });
  }
}
export async function bootstrapInTransaction(tx: Prisma.TransactionClient, client: PrismaClient, manifest: DevManifest, fixtures = devAccounts) {
  validateManifest(manifest, fixtures);
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1100)`;
  const service = new AccountProvisioningService(client);
  const result: Array<{ accountCode: string; created: boolean; initialPasswordValid: boolean }> = [];
  const ids = new Map<string, string>();
  for (const fixture of fixtures) {
    const password = manifest.accounts.find(account => account.accountCode === fixture.accountCode)!.password;
    const existing = await tx.user.findMany({ where: { OR: [{ accountCode: fixture.accountCode }, { email: fixture.email }] } });
    if (existing.length) {
      const account = existing[0];
      const owned = await tx.auditLog.findFirst({ where: { targetId: account.id, action: 'ACCOUNT_CREATED', operatorId: 'dev-bootstrap', outcome: 'SUCCESS' } });
      if (existing.length !== 1 || account.accountCode !== fixture.accountCode || account.email !== fixture.email || account.role !== fixture.role || !owned) throw new ConflictException('Reserved dev identity is already in use.');
      ids.set(fixture.accountCode, account.id);
      const initialPasswordValid = await verifyPassword(password, account.passwordHash);
      if (initialPasswordValid && needsPasswordRehash(account.passwordHash)) {
        // Upgrade the encoding of the known fixture password, never reset a changed password.
        await tx.user.updateMany({ where: { id: account.id, passwordHash: account.passwordHash }, data: { passwordHash: await hashPassword(password) } });
      }
      result.push({ accountCode: fixture.accountCode, created: false, initialPasswordValid });
      continue; // Never overwrite password, lock status, profile or assignment.
    }
    const staffId = fixture.staffCode ? ids.get(fixture.staffCode) : undefined;
    if (fixture.staffCode && !staffId) throw new Error('Missing bootstrap staff.');
    const account = await service.createInTransaction(tx, { accountCode: fixture.accountCode, email: fixture.email,
      role: fixture.role, fullName: fixture.fullName, password, ...(staffId ? { staffId } : {}) },
    { operatorId: 'dev-bootstrap', requestId: randomUUID() });
    ids.set(fixture.accountCode, account.id);
    result.push({ accountCode: fixture.accountCode, created: true, initialPasswordValid: true });
  }
  return result;
}
