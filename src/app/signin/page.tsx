import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signInWithGoogle } from "@/app/actions/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="glass w-full max-w-sm rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl font-bold">Pegels</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>

        {error && (
          <p className="mt-4 rounded-lg bg-[hsl(var(--negative)/0.12)] px-3 py-2 text-xs text-negative">
            This account isn&apos;t allowed to sign in.
          </p>
        )}

        <form action={signInWithGoogle} className="mt-6">
          <button
            type="submit"
            className="pressable w-full rounded-full bg-[hsl(var(--primary))] px-4 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
