import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { authUsers, authAccounts, authSessions, authVerificationTokens } from "./db/schema";
import { isAllowedEmail, resolveUserId, sessionCallback } from "./auth-helpers";
import { claimStubData } from "./db/claim";

const OWNER_EMAIL = process.env.OWNER_EMAIL;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [Google],
  session: { strategy: "database" },
  // Route auth errors (e.g. allowlist AccessDenied) back to /signin so its banner shows,
  // instead of Auth.js's built-in /api/auth/error page.
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Allowlist gate — runs before the adapter persists any row.
    signIn: ({ user }) => isAllowedEmail(user.email, OWNER_EMAIL),
    session: sessionCallback,
  },
  events: {
    // First-ever sign-in only: claim the owner's existing stub-owned data.
    createUser: async ({ user }) => {
      if (user.id && isAllowedEmail(user.email, OWNER_EMAIL)) await claimStubData(user.id);
    },
  },
});

/** The single auth seam. Returns the authenticated user's id or throws UNAUTHENTICATED. */
export async function getUserId(): Promise<string> {
  const dev = process.env.DEV_USER_ID; // local-dev bypass; unset on Vercel → real auth
  return resolveUserId(dev, dev ? null : await auth());
}
