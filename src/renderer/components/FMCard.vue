<template>
  <div class="fm" :style="{ background }" data-theme="dark">
    <div class="media-column">
      <img class="cover" :src="image" loading="lazy" @click="goToAlbum" />
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
    </div>

    <div class="right-part">
      <div class="info">
        <div class="title">{{ track.name }}</div>
        <div class="artist"><ArtistsInLine :artists="artists" /></div>
      </div>
      <div class="card-name"><svg-icon icon-class="fm" />{{ $t('fm.title') }}</div>
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
  padding: 0.4rem 0.75rem;
  background: var(--color-secondary-bg);
  border-radius: 1rem;
  display: grid;
  grid-template-columns: clamp(132px, 40%, 176px) minmax(0, 1fr);
  align-items: stretch;
  column-gap: clamp(0.35rem, 1.4cqw, 0.55rem);
  width: 100%;
  min-width: 0;
  height: 198px;
  box-sizing: border-box;
  overflow: hidden;
  container-type: inline-size;
}

.media-column {
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  align-items: center;
  justify-items: stretch;
  row-gap: 10px;
}

.cover {
  justify-self: stretch;
  width: 100%;
  height: 145px;
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
  clip-path: border-box;
  border-radius: 0.75rem;
  border: 4px solid rgba(255, 255, 255, 0.94);
  box-sizing: border-box;
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.22),
    inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  cursor: pointer;
  user-select: none;
}

.buttons {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .button-icon {
    margin: 0;
    padding: 2px 4px;
  }

  .svg-icon {
    width: 23px;
    height: 23px;
  }

  .svg-icon#thumbs-down {
    width: 21px;
    height: 21px;
  }
}

.right-part {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 0 0.05rem;
  color: var(--color-text);

  .info {
    min-width: 0;
    margin-top: 2px;
    padding-left: 0;
  }

  .title {
    font-size: 1.55rem;
    font-weight: 600;
    margin-bottom: 0.55rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    word-break: break-word;
  }

  .artist {
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    word-break: break-word;
  }

  .card-name {
    align-self: flex-end;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.95rem;
    opacity: 0.22;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    font-weight: 600;
    user-select: none;

    .svg-icon {
      flex: 0 0 auto;
      width: 17px;
      height: 17px;
      margin-right: 5px;
    }
  }
}

@container (max-width: 420px) {
  .cover {
    width: 100%;
    height: 136px;
    max-width: 100%;
    max-height: 100%;
  }

  .buttons {
    width: 100%;
    max-width: 100%;

    .button-icon {
      padding: 2px 3px;
    }

    .svg-icon {
      width: 21px;
      height: 21px;
    }

    .svg-icon#thumbs-down {
      width: 19px;
      height: 19px;
    }
  }

  .right-part {
    .info {
      margin-top: 7px;
    }

    .title {
      font-size: 1.3rem;
      margin-bottom: 0.38rem;
    }

    .artist {
      font-size: 0.92rem;
    }

    .card-name {
      font-size: 0.78rem;

      .svg-icon {
        width: 14px;
        height: 14px;
        margin-right: 4px;
      }
    }
  }
}

@container (max-width: 340px) {
  .media-column {
    grid-template-rows: auto auto;
    row-gap: 8px;
  }

  .cover {
    width: 100%;
    height: 108px;
    max-width: 100%;
    max-height: 100%;
  }

  .buttons {
    width: 100%;
    max-width: 100%;

    .button-icon {
      padding: 2px;
    }

    .svg-icon {
      width: 18px;
      height: 18px;
    }

    .svg-icon#thumbs-down {
      width: 17px;
      height: 17px;
    }
  }

  .right-part {
    .info {
      margin-top: 25px;
    }

    .title {
      font-size: 1.05rem;
      margin-bottom: 0.28rem;
    }

    .artist {
      font-size: 0.8rem;
    }

    .card-name {
      font-size: 0.68rem;

      .svg-icon {
        width: 12px;
        height: 12px;
        margin-right: 3px;
      }
    }
  }
}
</style>
