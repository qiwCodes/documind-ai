import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function getSupabaseServerEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerEnv();

  if (!url || !anonKey) {
    return null;
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
