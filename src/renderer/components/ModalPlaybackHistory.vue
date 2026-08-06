<template>
  <BaseModal
    :show="playbackHistoryModalVisible"
    :title="text.title"
    width="42vw"
    min-width="calc(min(38rem, 94vw))"
    :close-fn="close"
  >
    <template #default>
      <div class="history-tabs" role="tablist">
        <button
          type="button"
          :class="{ active: activeTab === 'queues' }"
          @click="activeTab = 'queues'"
        >
          {{ text.queues }}
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'recent' }"
          @click="activeTab = 'recent'"
        >
          {{ text.recent }}
        </button>
      </div>

      <div v-if="activeTab === 'queues'" class="history-panel">
        <div class="save-queue-row">
          <input v-model.trim="playlistName" :placeholder="text.playlistName" maxlength="80" />
          <button type="button" :disabled="!canSaveQueue" @click="saveCurrentQueue">
            {{ text.saveCurrent }}
          </button>
        </div>

        <div v-if="queueSnapshots.length" class="history-list">
          <article v-for="snapshot in queueSnapshots" :key="snapshot.id" class="history-card">
            <div class="history-card-copy">
              <strong>{{ snapshot.label }}</strong>
              <span>{{ formatQueueMeta(snapshot) }}</span>
            </div>
            <div class="history-card-actions">
              <button type="button" @click="restore(snapshot)">{{ text.restore }}</button>
              <button type="button" class="danger" @click="deleteQueueSnapshot(snapshot.id)">
                {{ text.delete }}
              </button>
            </div>
          </article>
        </div>
        <div v-else class="empty-state">{{ text.noQueues }}</div>
      </div>

      <div v-else class="history-panel">
        <div v-if="recentTracks.length" class="recent-grid">
          <button
            v-for="track in recentTracks"
            :key="`${track.id}-${track.playedAt}`"
            type="button"
            class="recent-track"
            @click="playTrack(track)"
          >
            <img :src="track.pic || defaultCover" alt="" />
            <span>
              <strong>{{ track.name }}</strong>
              <small>{{ track.artist || text.unknownArtist }}</small>
            </span>
          </button>
        </div>
        <div v-else class="empty-state">{{ text.noRecent }}</div>
      </div>

      <p v-if="status" class="history-status" role="status">{{ status }}</p>
    </template>

    <template #footer>
      <div class="history-footer">
        <button type="button" class="danger" @click="clearAll">{{ text.clear }}</button>
        <button type="button" class="primary" @click="close">{{ text.done }}</button>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseModal from './BaseModal.vue'
import { usePlayerStore } from '../store/player'
import { useLocalMusicStore } from '../store/localMusic'
import {
  clearPlaybackHistory,
  deleteQueueSnapshot,
  playbackHistoryModalVisible,
  playRecentTrack,
  queueSnapshots,
  recentTracks,
  restoreQueueSnapshot,
  type QueueSnapshot,
  type RecentTrackEntry
} from '../utils/playbackHistory'
import { resolveFeatureLanguage } from '../utils/v327FeatureShared'

const defaultCover = new URL('../assets/images/default.jpg', import.meta.url).href
const playerStore = usePlayerStore()
const localMusicStore = useLocalMusicStore()
const activeTab = ref<'queues' | 'recent'>('queues')
const playlistName = ref('')
const status = ref('')

const TEXTS = {
  zh: {
    title: '播放历史与队列',
    queues: '队列快照',
    recent: '最近播放',
    restore: '恢复',
    delete: '删除',
    clear: '清空记录',
    done: '完成',
    saveCurrent: '保存当前队列',
    playlistName: '本地歌单名称',
    noQueues: '还没有可恢复的队列快照',
    noRecent: '还没有最近播放记录',
    unknownArtist: '未知歌手',
    restored: '已恢复播放队列',
    saved: '当前队列已保存为本地歌单',
    saveFailed: '保存本地歌单失败',
    cleared: '播放历史已清空'
  },
  zht: {
    title: '播放歷史與佇列',
    queues: '佇列快照',
    recent: '最近播放',
    restore: '恢復',
    delete: '刪除',
    clear: '清空記錄',
    done: '完成',
    saveCurrent: '儲存目前佇列',
    playlistName: '本機歌單名稱',
    noQueues: '還沒有可恢復的佇列快照',
    noRecent: '還沒有最近播放記錄',
    unknownArtist: '未知歌手',
    restored: '已恢復播放佇列',
    saved: '目前佇列已儲存為本機歌單',
    saveFailed: '儲存本機歌單失敗',
    cleared: '播放歷史已清空'
  },
  en: {
    title: 'Playback History & Queues',
    queues: 'Queue snapshots',
    recent: 'Recently played',
    restore: 'Restore',
    delete: 'Delete',
    clear: 'Clear history',
    done: 'Done',
    saveCurrent: 'Save current queue',
    playlistName: 'Local playlist name',
    noQueues: 'No restorable queue snapshots yet.',
    noRecent: 'No recently played tracks yet.',
    unknownArtist: 'Unknown artist',
    restored: 'Playback queue restored',
    saved: 'Current queue saved as a local playlist',
    saveFailed: 'Could not save the local playlist',
    cleared: 'Playback history cleared'
  }
} as const

const text = computed(() => TEXTS[resolveFeatureLanguage()])
const canSaveQueue = computed(
  () => Boolean(playlistName.value.trim()) && playerStore._list.length > 0
)

const formatQueueMeta = (snapshot: QueueSnapshot): string => {
  const date = new Date(snapshot.createdAt).toLocaleString()
  return `${snapshot.trackIds.length} 首 · ${date}`
}

const restore = async (snapshot: QueueSnapshot) => {
  status.value = ''
  if (await restoreQueueSnapshot(snapshot)) {
    status.value = text.value.restored
    close()
  }
}

const playTrack = async (track: RecentTrackEntry) => {
  status.value = ''
  if (await playRecentTrack(track)) close()
}

const saveCurrentQueue = async () => {
  if (!canSaveQueue.value) return
  status.value = ''

  const trackIds = [...playerStore._list]
  const result = await localMusicStore.createLocalPlaylist({
    name: playlistName.value.trim(),
    coverImgUrl: playerStore.pic || defaultCover,
    trackCount: trackIds.length,
    trackIds
  })

  if (result) {
    status.value = text.value.saved
    playlistName.value = ''
  } else {
    status.value = text.value.saveFailed
  }
}

const clearAll = () => {
  clearPlaybackHistory()
  status.value = text.value.cleared
}

const close = () => {
  playbackHistoryModalVisible.value = false
}
</script>

<style scoped lang="scss">
.history-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-bottom: 12px;

  button {
    min-height: 36px;
    border-radius: 9px;
    background: var(--color-secondary-bg-for-transparent);

    &.active {
      color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary), transparent 88%);
    }
  }
}

.history-panel {
  min-height: 220px;
  max-height: min(52vh, 440px);
  overflow: auto;
}

.save-queue-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;

  input {
    min-width: 0;
    flex: 1;
    height: 38px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--color-text), transparent 86%);
    border-radius: 9px;
    outline: none;
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);
  }

  button {
    padding: 0 12px;
    border-radius: 9px;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary), transparent 88%);
  }
}

.history-list {
  display: grid;
  gap: 7px;
}

.history-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--color-text), transparent 90%);
  border-radius: 10px;
  background: var(--color-secondary-bg-for-transparent);
}

.history-card-copy {
  min-width: 0;
  display: grid;
  gap: 3px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: color-mix(in srgb, var(--color-text), transparent 46%);
    font-size: 11px;
  }
}

.history-card-actions,
.history-footer {
  display: flex;
  gap: 7px;

  button {
    padding: 7px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--color-text), transparent 92%);
  }
}

.recent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.recent-track {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 7px;
  border-radius: 10px;
  text-align: left;
  background: var(--color-secondary-bg-for-transparent);

  img {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    border-radius: 7px;
    object-fit: cover;
  }

  span {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: color-mix(in srgb, var(--color-text), transparent 46%);
  }
}

.empty-state {
  display: grid;
  min-height: 200px;
  place-items: center;
  color: color-mix(in srgb, var(--color-text), transparent 48%);
}

.history-status {
  margin: 10px 2px 0;
  color: var(--color-primary);
  font-size: 12px;
}

.history-footer {
  justify-content: space-between;
  width: 100%;
}

.danger {
  color: #d54;
}

@media (max-width: 650px) {
  .recent-grid {
    grid-template-columns: 1fr;
  }
}
</style>
