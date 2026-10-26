import { fetchUrl, formatTitle } from 'utils/generalUtils'
import { MapWithModels } from 'types/maps'
import {Metadata} from "next";
import MapViewerRenderer from "./MapViewerRenderer.tsx";
import { ViewerPage } from "./ViewerShell";
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: {
  params: Promise<{ map_name: string }>
}): Promise<Metadata> {
  const { map_name } = await params;
  const t = await getTranslations('metadata');

  return {
    title: formatTitle(t('map3dTitle', {map: map_name})),
    description: t('map3dDescription', {map: map_name}),
    alternates: { canonical: `/maps/${map_name}/3d` },
  };
}

export default async function Map3DPage({ params, searchParams }: {
  params: Promise<{ map_name: string }>,
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { map_name } = await params
  const { server_slug } = await searchParams

  let modelMetadata: MapWithModels | null = null
  let error: string | null = null
  try {
    modelMetadata = await fetchUrl(`/maps/${map_name}/3d`)
  } catch (err) {
    console.error('Failed to fetch model metadata:', err)
    error = err instanceof Error ? err.message : 'Failed to load model metadata'
  }

  return (
    <ViewerPage
      backHref={server_slug ? `/servers/${server_slug}/maps/${map_name}` : `/maps/${map_name}`}
      backLabel="Back to Map"
      viewer={<MapViewerRenderer map_name={map_name} modelMetadata={modelMetadata} error={error} />}
    >
      <h1 className="text-3xl font-bold mb-2">{map_name} - 3D View</h1>
      <p className="text-muted-foreground">
        Interactive 3D model viewer with FPS controls - Press F for fullscreen
      </p>
    </ViewerPage>
  )
}
