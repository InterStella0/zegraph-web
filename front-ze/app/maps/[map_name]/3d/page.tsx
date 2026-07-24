import { formatTitle } from 'utils/generalUtils'
import Link from 'next/link'
import { Button } from 'components/ui/button'
import { ArrowLeft} from 'lucide-react'
import {Metadata} from "next";
import MapViewerRenderer from "./MapViewerRenderer.tsx";
import { getTranslations } from 'next-intl/server';


export async function generateMetadata({ params }: {
  params: Promise<{ map_name: string }>
}): Promise<Metadata> {
  const { map_name } = await params;
  const t = await getTranslations('metadata');

  return {
    title: formatTitle(t('map3dTitle', {map: map_name})),
    description: t('map3dDescription', {map: map_name}),
    alternates: {
      canonical: `/maps/${map_name}/3d`
    }
  };
}

export default async function Map3DPage({ params, searchParams }: {
  params: Promise<{ map_name: string }>,
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { map_name } = await params
  const server_slug = (await searchParams).server_slug

  const backUrl = `/servers/${server_slug}/maps/${map_name}`

  if (!map_name) {
    return null // Loading state while params resolve
  }

  return (
    <div className="container max-w-screen-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backUrl}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Map
            </Link>
          </Button>
        </div>

        <h1 className="text-3xl font-bold mb-2">{map_name} - 3D View</h1>
        <p className="text-muted-foreground">
          Interactive 3D model viewer with FPS controls - Press F for fullscreen
        </p>
      </div>

      <div className="h-[calc(100vh-16rem)] border rounded-lg overflow-hidden bg-background flex items-center justify-center">
        <MapViewerRenderer map_name={map_name} />
      </div>
    </div>
  )
}
