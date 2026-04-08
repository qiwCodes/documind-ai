import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function requireUser(nextPath: string) {
  const { userId, sessionClaims } = await auth();
  const email = (sessionClaims?.email as string | undefined) ?? "Signed-in user";

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return { email };
}
