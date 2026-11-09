import "server-only";
import { redirect } from "next/navigation";
import { getAuth, type Auth } from "@/lib/auth/session";

/** For server components: require a fully signed-in user, else redirect to login. */
export async function requirePageAuth(path: string): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (auth.pendingMfa) redirect(`/mfa?next=${encodeURIComponent(path)}`);
  return auth;
}
