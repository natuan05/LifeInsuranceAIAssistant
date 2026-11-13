/** No immutable confirmed-content schema exists yet. confirmedAt, aiSummary and
 * extractedDetails must never be promoted to proof of reviewed content. */
export function legacyTicketConfirmation(): {
  confirmationSource: 'LEGACY_UNVERIFIED'; confirmedContent: null;
} {
  return { confirmationSource: 'LEGACY_UNVERIFIED', confirmedContent: null };
}
