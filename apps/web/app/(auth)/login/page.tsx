import { GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">narratorlog</h1>
          <p className="text-muted-foreground text-sm">
            Your codebase has a story. narratorlog tells it.
          </p>
        </div>

        <div className="space-y-3">
          <a href={`${process.env.NEXT_PUBLIC_API_URL}/auth/github`}>
            <Button className="w-full" size="lg">
              <GitBranch className="mr-2 h-4 w-4" />
              Continue with GitHub
            </Button>
          </a>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Self-hosted. Your data stays on your infrastructure.
        </p>
      </div>
    </div>
  )
}