export default function Loading() {
  return (
    <div className="container max-w-screen-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="h-9 w-64 bg-muted animate-pulse rounded mb-2" />
        <div className="h-5 w-96 bg-muted animate-pulse rounded" />
      </div>
      <div className="h-[calc(100vh-16rem)] border rounded-lg bg-muted/30 animate-pulse flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading 3D viewer...</div>
          <div className="text-sm text-muted-foreground mt-2">
            Preparing the 3D environment
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-32 bg-muted/50 animate-pulse rounded-lg" />
        <div className="h-32 bg-muted/50 animate-pulse rounded-lg" />
      </div>
    </div>
  )
}
