<template>
  <ul
    v-if="releaseNoteItems.length"
    class="update-release"
    :aria-label="$t('settings.update.diagnostics.releaseNotesLabel')"
  >
    <li v-for="(item, index) in releaseNoteItems" :key="`${index}-${item}`">
      {{ item }}
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue'
import { useNormalStateStore } from '../store/state'
const { latestVersion } = toRefs(useNormalStateStore())
const MAX_RELEASE_NOTE_ITEMS = 8
const MAX_RELEASE_NOTE_LENGTH = 120

const cleanReleaseNoteText = (value: string): string =>
  value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^[-+*]\s+/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

const buildReleaseNoteItems = (releaseNotes: unknown): string[] => {
  const raw = String(releaseNotes || '')
    .replace(/\r/g, '')
    .trim()
  if (!raw) return []

  const normalized = raw
    .replace(/(^|\n)\s*#{1,6}\s*/g, '\n')
    .replace(/\s+#{1,6}\s+/g, '\n')
    .replace(/(^|\n)\s*[-+*]\s+/g, '\n')
    .replace(/\s+-\s+(?=[\p{L}\p{N}“"'《（])/gu, '\n')

  return normalized
    .split('\n')
    .map(cleanReleaseNoteText)
    .filter(Boolean)
    .filter((item) => !/^VutronMusic\s+v?\d/i.test(item))
    .filter((item) => !/^完整变更记录[:：]?/i.test(item))
    .filter((item) => !/^v?\d+\.\d+\.\d+\s*(?:\.{2,}|…)/i.test(item))
    .filter((item) => !(item.length <= 14 && !/[，。,:：；!?！？]/.test(item)))
    .map((item) =>
      item.length > MAX_RELEASE_NOTE_LENGTH
        ? `${item.slice(0, MAX_RELEASE_NOTE_LENGTH - 1).trimEnd()}…`
        : item
    )
    .slice(0, MAX_RELEASE_NOTE_ITEMS)
}

const releaseNoteItems = computed(() =>
  buildReleaseNoteItems(latestVersion.value?.updateInfo?.releaseNotes)
)
</script>

<style lang="scss">
.update-release {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 14px 18px 14px 38px;
  border-radius: 12px;
  background-color: var(--color-secondary-bg);

  li {
    margin: 0 0 8px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  li:last-child {
    margin-bottom: 0;
  }
}
</style>
