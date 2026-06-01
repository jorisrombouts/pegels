"use server";

import { auth, signIn, signOut } from "@/lib/auth";

export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}

export async function currentUserEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

export interface SessionUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
}
