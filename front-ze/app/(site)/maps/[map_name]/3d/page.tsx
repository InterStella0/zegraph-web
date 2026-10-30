import { permanentRedirect } from 'next/navigation'
import { map3dViewerUrl } from 'utils/generalUtils'

/** 3D views now live on maps.cybo.dev; keep old links working. */
export default async function Map3DPage({ params }: { params: Promise<{ map_name: string }> }) {
  const { map_name } = await params
  permanentRedirect(map3dViewerUrl(map_name))
}
