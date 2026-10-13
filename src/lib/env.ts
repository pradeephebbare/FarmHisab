function normalizeEnvValue(value: string | undefined, fallback: string, placeholder: RegExp) {
  const cleaned = value?.trim();
  if (!cleaned || placeholder.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export function publicEnv() {
  const url = normalizeEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "http://localhost:54321",
    /your-project-url|example\.supabase\.co/i,
  );
  const anon = normalizeEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "local-anon-key",
    /your-anon-public-key|replace-me/i,
  );

  try {
    new URL(url);
  } catch {
    return { url: "http://localhost:54321", anon };
  }

  return { url, anon };
}

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
