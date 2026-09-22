<template>
  <div class="fm" :style="{ background }" data-theme="dark">
    <img class="cover" :src="image" loading="lazy" @click="goToAlbum" />
    <div class="right-part">
      <div class="info">
        <div class="title">{{ track.name }}</div>
        <div class="artist"><ArtistsInLine :artists="artists" /></div>
      </div>
      <div class="controls">
        <div class="buttons">
          <button-icon :title="$t('fm.dislike')" @click="moveToFMTrash">
            <svg-icon id="thumbs-down" icon-class="thumbs-down" />
          </button-icon>
          <button-icon
            :title="$t(isPlaying ? 'player.pause' : 'player.play')"
            class="play"
            @click="playPersonalFM"
          >
            <svg-icon :icon-class="isPlaying ? 'pause' : 'play'" />
          </button-icon>
          <button-icon :title="$t('player.next')" @click="playNextFMTrack">
            <svg-icon icon-class="next" />
          </button-icon>
        </div>
        <div class="card-name"><svg-icon icon-class="fm" />{{ $t('fm.title') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ButtonIcon from './ButtonIcon.vue'
import ArtistsInLine from './ArtistsInLine.vue'
import SvgIcon from './SvgIcon.vue'
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/player'
import { useRouter } from 'vue-router'
import { Vibrant } from 'node-vibrant/browser'
import Color from 'color'
import { normalizeNeteaseAssetUrl } from '../../shared/neteaseAssetUrl'

const router = useRouter()
const playerStore = usePlayerStore()
const { moveToFMTrash, playPersonalFM, playNextFMTrack } = playerStore
const { personalFMTrack, playing, isPersonalFM } = storeToRefs(playerStore)

const background = ref<string>()

const track = computed(() => personalFMTrack.value)
const isPlaying = computed(() => playing.value && isPersonalFM.value)
const artists = computed(() => track.value.artists || track.value.ar || [])
const album = computed(() => track.value?.album || track.value?.al)

const image = computed(() => {
  const picUrl = album.value?.picUrl
  return picUrl ? `${normalizeNeteaseAssetUrl(picUrl)}?param=256y256` : ''
})

const getColor = (currentTrack: any) => {
  const currentAlbum = currentTrack.album || currentTrack.al
  if (!currentAlbum?.picUrl) return

  const cover = `${normalizeNeteaseAssetUrl(currentAlbum.picUrl)}?param=512y512`
  Vibrant.from(cover)
    .getPalette()
    .then((palette) => {
      const swatch = palette.DarkMuted
      if (swatch) {
        const originColor = Color.rgb(swatch.rgb)
        const color = originColor.darken(0.1).rgb().string()
        const color2 = originColor.lighten(0.28).rotate(-30).rgb().string()
        background.value = `linear-gradient(to top left, ${color}, ${color2})`
      } else {
        console.log('未找到 DarkMuted 颜色')
      }
    })
    .catch((error) => {
      console.warn('[FMCard] 提取封面颜色失败', error)
    })
}

const goToAlbum = () => {
  const albumId = album.value?.id
  if (!albumId) return
  void router.push({ path: `/album/${albumId}` })
}

watch(
  track,
  (value) => {
    if (value) getColor(value)
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.fm {
  padding: 1rem;
  background: var(--color-secondary-bg);
  border-radius: 1rem;
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 198px;
  box-sizing: border-box;
  overflow: hidden;
  container-type: inline-size;
}

.cover {
  flex: 0 1 166px;
  width: min(166px, 42%);
  min-width: 0;
  height: 100%;
  object-fit: cover;
  clip-path: border-box;
  border-radius: 0.75rem;
  margin-right: clamp(0.65rem, 3cqw, 1.2rem);
  cursor: pointer;
  user-select: none;
}

.right-part {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: var(--color-text);
  .title {
    font-size: 1.6rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .artist {
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .controls {
    display: flex;
    min-width: 0;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.35rem;
    margin-left: -0.4rem;

    .buttons {
      display: flex;
      flex: 0 0 auto;
      min-width: 0;
    }
    .button-icon {
      margin: 0 8px 0 0;
    }
    .svg-icon {
      width: 24px;
      height: 24px;
    }
    .svg-icon#thumbs-down {
      width: 22px;
      height: 22px;
    }
    .card-name {
      flex: 0 0 auto;
      min-width: max-content;
      max-width: none;
      overflow: visible;
      white-space: nowrap;
      text-overflow: clip;
      font-size: 1rem;
      opacity: 0.18;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      font-weight: 600;
      user-select: none;

      .svg-icon {
        flex: 0 0 auto;
        width: 18px;
        height: 18px;
        margin-right: 6px;
      }
    }
  }
}

@container (max-width: 420px) {
  .cover {
    flex-basis: 138px;
    width: min(138px, 38%);
  }

  .right-part {
    .title {
      font-size: 1.35rem;
    }

    .controls {
      .button-icon {
        margin-right: 4px;
      }

      .buttons {
        gap: 0;
      }

      .button-icon {
        padding: 5px;
        margin-right: 2px;
      }

      .svg-icon {
        width: 22px;
        height: 22px;
      }

      .svg-icon#thumbs-down {
        width: 20px;
        height: 20px;
      }

      .card-name {
        flex: 0 0 auto;
        min-width: max-content;
        max-width: none;
        font-size: 0.8rem;

        .svg-icon {
          width: 15px;
          height: 15px;
          margin-right: 4px;
        }
      }
    }
  }
}

@container (max-width: 340px) {
  .fm {
    padding: 0.8rem;
  }

  .cover {
    flex-basis: 96px;
    width: min(96px, 32%);
    margin-right: 0.55rem;
  }

  .right-part {
    .title {
      font-size: 1.08rem;
      margin-bottom: 0.35rem;
    }

    .artist {
      font-size: 0.82rem;
    }

    .controls {
      gap: 0.2rem;
      margin-left: -0.2rem;

      .button-icon {
        padding: 3px;
        margin-right: 1px;
      }

      .svg-icon {
        width: 20px;
        height: 20px;
      }

      .svg-icon#thumbs-down {
        width: 18px;
        height: 18px;
      }

      .card-name {
        display: flex;
        flex: 0 0 auto;
        min-width: max-content;
        max-width: none;
        font-size: 0.72rem;
        white-space: nowrap;

        .svg-icon {
          width: 14px;
          height: 14px;
          margin-right: 3px;
        }
      }
    }
  }
}
</style>
