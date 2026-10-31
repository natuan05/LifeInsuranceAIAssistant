import type { PolicyBenefitDto, PolicyBenefitsSnapshotDto } from '../dto/policy-response.dto';

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\p{Cc}]/u.test(value) ? value : null;
}
export function currency(value: unknown): string | null {
  const code = object(value)?.currency;
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : null;
}
function amount(value: unknown): string | null {
  const raw = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  if (typeof raw !== 'string' || !/^\d{1,13}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}
function integer(value: unknown, maximum: number) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum ? value : null; }
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
export function benefitsSnapshot(value: unknown): { benefitsSnapshot: PolicyBenefitsSnapshotDto | null; benefitsSnapshotStatus: 'AVAILABLE' | 'NOT_PROVIDED' | 'INVALID' } {
  if (value === null) return { benefitsSnapshot: null, benefitsSnapshotStatus: 'NOT_PROVIDED' };
  const source = object(value);
  let valid = source !== null;
  function field<T>(input: unknown, parse: (value: unknown) => T | null): T | null {
    if (input === undefined || input === null) return null;
    const parsed = parse(input); if (parsed === null) valid = false;
    return parsed;
  }
  let benefits: PolicyBenefitDto[] | null = null;
  if (source?.benefits !== undefined && source.benefits !== null) {
    if (!Array.isArray(source.benefits) || source.benefits.length > 100) valid = false;
    else benefits = source.benefits.map((entry: unknown) => {
      const item = object(entry); const name = text(item?.name, 255);
      if (!item || !name) valid = false;
      return { name: name ?? '', code: field(item?.code, v => text(v, 80)), amount: field(item?.amount, amount),
        unit: field(item?.unit, v => text(v, 32)), maxDays: field(item?.maxDays, v => integer(v, 366)) };
    });
  }
  // Only financial display fields cross the boundary. No raw snapshot, identity,
  // document bindings, internal fixture tags, credentials or arbitrary metadata.
  const snapshot = { currency: field(source?.currency, v => typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null),
    snapshotAsOf: field(source?.snapshotAsOf, date), insuranceTermYears: field(source?.insuranceTermYears, v => integer(v, 200)),
    premiumTermYears: field(source?.premiumTermYears, v => integer(v, 200)), annualPremium: field(source?.annualPremium, amount), benefits };
  return valid ? { benefitsSnapshot: snapshot, benefitsSnapshotStatus: 'AVAILABLE' } : { benefitsSnapshot: null, benefitsSnapshotStatus: 'INVALID' };
}
