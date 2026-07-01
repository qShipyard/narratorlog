function apiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:8080'
  )
}

/** Server-side setup check. Returns null when the API is unreachable. */
export async function fetchSetupComplete(): Promise<boolean | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/setup/status`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { setup_complete?: boolean }
    return data.setup_complete === true
  } catch {
    return null
  }
}
