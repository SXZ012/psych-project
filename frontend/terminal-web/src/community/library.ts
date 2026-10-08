import { shallowRef } from 'vue'
import { scales } from '../config/community/scales'
import { selfScales, officialResources, scienceDetails } from '../config/community/libraryContent'
import { fetchWithTimeout } from '../utils/net'
import { validLibrary } from './libraryValidation'

export const bundledLibrary = { scales, selfScales, officialResources, scienceDetails }
export const communityLibrary = shallowRef(bundledLibrary)
let loading: Promise<void> | null = null

/** The bundled edition keeps free tools usable if the content service is unavailable. */
export function loadCommunityLibrary(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const response = await fetchWithTimeout('/api/v1/content/community-library', {}, 5000)
      if (!response.ok) return
      const { payload } = await response.json()
      if (!validLibrary(payload, scales.map(item => item.short))) return
      communityLibrary.value = payload
    } catch { /* Keep the validated bundled edition. */ }
    finally { loading = null }
  })()
  return loading
}
