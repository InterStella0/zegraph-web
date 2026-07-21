import {fetchApiUrl} from "utils/generalUtils";
import { Guide } from "types/guides";

export type GuideSlugPromise = Promise<Guide | null>;


export function resolveGuideLink(serverGoto: string | null, endpoint: string){
  return serverGoto? `/servers/${serverGoto}/maps${endpoint}`: `/maps${endpoint}`
}

export async function getGuideBySlug(
  map_name: string,
  guide_slug: string,
  serverId?: string
): GuideSlugPromise {
  try {
    return await fetchApiUrl(resolveGuideLink(serverId, `/${map_name}/guides/slugs/${guide_slug}`),
      { cache: 'no-store' }
    );
  } catch (error) {
    if (error.code === 404){
      try{
        return await fetchApiUrl(resolveGuideLink(serverId, `/${map_name}/guides/${guide_slug}`),
            { cache: 'no-store' }
        );
      }catch (e){}
    }
    console.error('Error fetching guide by slug:', error);
    return null;
  }
}
