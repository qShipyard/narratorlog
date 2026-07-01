import { redirect } from 'next/navigation'
import { fetchSetupComplete } from '@/lib/setup-server'

export default async function Home() {
  const setupComplete = await fetchSetupComplete()

  if (setupComplete !== true) {
    redirect('/setup')
  }

  redirect('/dashboard')
}