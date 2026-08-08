/**
 * True when the description references one of the user's own bank account numbers
 * (a transfer between own accounts). Spaces are ignored on both sides so
 * "9988 7766554" matches "99887766554".
 *
 * This is account *identity*, not categorization — it keys off `Account.accountNumber`, so it
 * outlives the rules engine.
 */
export function matchesOwnAccount(description: string, ownNumbers: string[]): boolean {
  const d = description.replace(/\s/g, "");
  return ownNumbers.some((n) => {
    const num = n.replace(/\s/g, "");
    return num.length > 0 && d.includes(num);
  });
}
