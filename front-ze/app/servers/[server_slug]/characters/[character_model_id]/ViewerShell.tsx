import { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, LucideIcon } from 'lucide-react'
import { Button } from 'components/ui/button'
import { Card } from 'components/ui/card'
import { formatFileSize } from 'utils/format'

/** Page frame for the character 3D viewer. */
export function ViewerPage({ backHref, backLabel, viewer, children }: {
  backHref: string,
  backLabel: string,
  viewer: ReactNode,
  children: ReactNode,
}) {
  return (
    <div className="container max-w-screen-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLabel}
            </Link>
          </Button>
        </div>
        {children}
      </div>

      <div className="h-[calc(100vh-16rem)] border rounded-lg overflow-hidden bg-background flex items-center justify-center">
        {viewer}
      </div>
    </div>
  )
}

export function ViewerCard({ icon: Icon, iconClassName = 'text-primary', title, children }: {
  icon: LucideIcon,
  iconClassName?: string,
  title: ReactNode,
  children: ReactNode,
}) {
  return (
    <Card className="max-w-md p-8 text-center">
      <Icon className={`w-16 h-16 mx-auto mb-4 ${iconClassName}`} />
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      {children}
    </Card>
  )
}

export function LoadModelButton({ label, fileSize, className = '', ...props }: ComponentProps<typeof Button> & {
  label: string,
  fileSize?: number,
}) {
  return (
    <Button size="lg" className={`flex-col h-auto py-3 ${className}`} {...props}>
      <span>{label}</span>
      {fileSize != null && <span className="text-xs opacity-70">{formatFileSize(fileSize)}</span>}
    </Button>
  )
}
