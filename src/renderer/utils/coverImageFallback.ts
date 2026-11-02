import type { ObjectDirective } from 'vue'
import { buildNeteaseImageProxyUrl, isNeteaseAssetUrl } from '../../shared/neteaseAssetUrl'
import { getUsableTrackCoverUrl } from '../../shared/trackCover'

const DEFAULT_COVER = 'atom://get-default-pic'
type CoverState = {
  requested: string
  source: string
  stage: number
  visibility: string
  error: () => void
  load: () => void
}
const states = new WeakMap<HTMLImageElement, CoverState>()

const setState = (image: HTMLImageElement, state: CoverState, value: string) => {
  image.dataset.vutronCoverState = value
  image.style.visibility = value === 'error' || value === 'empty' ? 'hidden' : state.visibility
}
const showDefault = (image: HTMLImageElement, state: CoverState) => {
  state.stage = 2
  setState(image, state, 'fallback-loading')
  image.src = DEFAULT_COVER
}

/** Try the original, then its guarded CDN proxy, and only then the local default image. */
export const vCoverFallback: ObjectDirective<HTMLImageElement, string> = {
  mounted(image, binding) {
    const state: CoverState = {
      requested: binding.value || '',
      source: getUsableTrackCoverUrl({ picUrl: binding.value }),
      stage: 0,
      visibility: image.style.visibility,
      error: () => {},
      load: () => {}
    }
    state.error = () => {
      if (state.stage >= 3) return
      if (state.stage === 2) {
        state.stage = 3
        setState(image, state, 'error')
        return
      }
      if (!state.source) return
      const proxy =
        state.stage === 0 && isNeteaseAssetUrl(state.source)
          ? buildNeteaseImageProxyUrl(state.source)
          : ''
      if (proxy) {
        state.stage = 1
        setState(image, state, 'loading')
        image.src = proxy
      } else showDefault(image, state)
    }
    state.load = () => {
      if (image.naturalWidth > 0 && (state.source || state.stage === 2)) {
        setState(image, state, state.stage === 2 ? 'fallback' : 'loaded')
      }
    }
    states.set(image, state)
    image.setAttribute('data-vutron-cover', '')
    image.addEventListener('error', state.error)
    image.addEventListener('load', state.load)
    setState(image, state, state.source ? 'loading' : 'empty')
    if (binding.value === DEFAULT_COVER) showDefault(image, state)
    else if (!state.source) image.removeAttribute('src')
    else if (image.complete) {
      if (image.naturalWidth > 0) state.load()
      else state.error()
    }
  },
  updated(image, binding) {
    const state = states.get(image)
    const requested = binding.value || ''
    if (state && requested !== state.requested) {
      state.requested = requested
      state.source = getUsableTrackCoverUrl({ picUrl: requested })
      state.stage = 0
      setState(image, state, state.source ? 'loading' : 'empty')
      if (requested === DEFAULT_COVER) showDefault(image, state)
      else if (!state.source) image.removeAttribute('src')
      else if (image.getAttribute('src') !== state.source) image.src = state.source
    }
  },
  beforeUnmount(image) {
    const state = states.get(image)
    if (state) {
      image.removeEventListener('error', state.error)
      image.removeEventListener('load', state.load)
    }
    states.delete(image)
  }
}
