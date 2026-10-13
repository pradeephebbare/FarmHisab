import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Referenced literally so Next.js can inline the public values into the browser bundle.
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
}
