'use client'

import { useEffect } from 'react'
import { Button } from 'components/ui/button'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="container max-w-screen-2xl mx-auto px-4 py-6">
      <div className="flex flex-col items-center justify-center h-[calc(100vh-16rem)]">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
          <p className="text-muted-foreground mb-6">
            Failed to load the 3D viewer. The model file might be missing or corrupted.
          </p>
          <div className="flex gap-4 justify-center">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/maps">Back to Maps</Link>
            </Button>
          </div>
          {error.message && (
            <div className="mt-6 p-4 bg-muted rounded-lg text-left">
              <p className="text-xs font-mono text-muted-foreground">
                Error: {error.message}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
