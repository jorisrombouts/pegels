import type { Session } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";

/** True only when `email` equals the single allowlisted owner (case-insensitive). */
export function isAllowedEmail(email: string | null | undefined, owner: string | null | undefined): boolean {
  return !!email && !!owner && email.toLowerCase() === owner.toLowerCase();
}

/** Extract the user id from a session, throwing if unauthenticated. */
export function requireUserId(session: { user?: { id?: string } } | null): string {
  const id = session?.user?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  return id;
}

/** Database-session callback: surface the adapter user's id on session.user.id. */
export function sessionCallback({ session, user }: { session: Session; user: AdapterUser }): Session {
  session.user.id = user.id;
  return session;
}
