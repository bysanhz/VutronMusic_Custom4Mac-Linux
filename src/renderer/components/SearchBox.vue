<template>
  <div class="search-container">
    <div ref="searchIconRef" class="search-icon" :class="{ active: showInput }" @click="toggleInput"
      ><svg-icon icon-class="search"
    /></div>
    <input
      ref="inputRef"
      v-model="keywords"
      type="search"
      class="search-input"
      :placeholder="effectivePlaceholder"
      :style="{ width: showInputWidth + 'px', padding: showPadding }"
      @focus="handleFocus"
      @input="showSuggestions = props.suggestions"
      @keydown.enter="doKeydownEnter"
      @keydown.esc="showSuggestions = false"
      @blur="doblur"
    />
    <div v-if="props.suggestions && showSuggestions && showInput" class="search-suggestions">
      <div class="suggestion-title">{{ keywords ? '搜索' : '热搜' }}</div>
      <button
        v-if="keywords"
        class="suggestion-item keyword-item"
        @mousedown.prevent="chooseSuggestion(keywords)"
      >
        <span class="rank search-mark">↵</span>
        <span class="word">搜索 “{{ keywords }}”</span>
      </button>
      <button
        v-for="(item, index) in hotKeywords"
        v-show="!keywords"
        :key="`${item.searchWord}-${index}`"
        class="suggestion-item"
        @mousedown.prevent="chooseSuggestion(item.searchWord)"
      >
        <span class="rank">{{ index + 1 }}</span>
        <span class="suggestion-main">
          <span class="word">{{ item.searchWord }}</span>
          <span v-if="item.content" class="desc">{{ item.content }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SvgIcon from './SvgIcon.vue'
import { searchDefault, searchHotDetail } from '../api/discovery'

const props = defineProps({
  showInputInitially: {
    type: Boolean,
    default: false
  },
  inputWidth: {
    type: Number,
    default: 140
  },
  placeholder: {
    type: String,
    default: '搜索'
  },
  clearKeywords: {
    type: Boolean,
    default: false
  },
  suggestions: {
    type: Boolean,
    default: false
  }
})

const $emit = defineEmits(['keydownEnter'])
const showInput = ref(props.showInputInitially)
const keywords = ref('')
const showInputWidth = ref(showInput.value ? props.inputWidth : 0)
const showPadding = ref(showInput.value ? '4px' : '0px')
const inputRef = ref<HTMLInputElement | null>(null)
const showSuggestions = ref(false)
const defaultKeyword = ref('')
const hotKeywords = ref<Array<{ searchWord: string; content?: string }>>([])
const suggestionsLoaded = ref(false)

const effectivePlaceholder = computed(() => defaultKeyword.value || props.placeholder)

const loadSuggestions = async () => {
  if (!props.suggestions || suggestionsLoaded.value) return
  suggestionsLoaded.value = true
  const [defaultResult, hotResult] = await Promise.allSettled([searchDefault(), searchHotDetail()])
  if (defaultResult.status === 'fulfilled') {
    defaultKeyword.value =
      defaultResult.value?.data?.showKeyword || defaultResult.value?.data?.realkeyword || ''
  }
  if (hotResult.status === 'fulfilled') {
    const data = hotResult.value?.data
    hotKeywords.value = Array.isArray(data)
      ? data
          .filter((item: any) => item?.searchWord)
          .slice(0, 10)
          .map((item: any) => ({ searchWord: item.searchWord, content: item.content }))
      : []
  }
}

const doKeydownEnter = () => {
  const keyword = keywords.value.trim() || defaultKeyword.value.trim()
  if (!keyword) return
  $emit('keydownEnter', keyword)
  showSuggestions.value = false
  if (!props.clearKeywords) return
  keywords.value = ''
  inputRef.value?.blur()
}

const chooseSuggestion = (keyword: string) => {
  const value = keyword.trim()
  if (!value) return
  keywords.value = value
  $emit('keydownEnter', value)
  showSuggestions.value = false
  if (props.clearKeywords) {
    keywords.value = ''
    inputRef.value?.blur()
  }
}

const handleFocus = () => {
  void loadSuggestions()
  if (props.suggestions) showSuggestions.value = true
}

const toggleInput = () => {
  if (props.showInputInitially) {
    showInput.value = true
    inputRef.value?.focus()
    return
  }
  showInput.value = !showInput.value
  if (showInput.value) {
    showInputWidth.value = props.inputWidth
    showPadding.value = '4px'
    inputRef.value?.focus()
  } else {
    showInputWidth.value = 0
    showPadding.value = '0px'
    showSuggestions.value = false
    inputRef.value?.blur()
  }
}

const doblur = () => {
  window.setTimeout(() => {
    showSuggestions.value = false
    if (!keywords.value && !props.showInputInitially) toggleInput()
  }, 120)
}

defineExpose({ keywords })
</script>

<style scoped lang="scss">
.search-container {
  position: relative;
  display: flex;
  align-items: center;
  border: none;
  border-radius: 8px;
  -webkit-app-region: no-drag;
  height: 32px;
  box-sizing: border-box;
  background: var(--color-secondary-bg-for-transparent);
}

.search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.svg-icon {
  height: 14px;
  width: 14px;
  opacity: 0.28;
}

.search-input {
  padding: 4px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  color: var(--color-text);
  background: transparent;
  transition: all 0.3s;
}

.search-suggestions {
  position: absolute;
  top: 40px;
  right: 0;
  width: 320px;
  max-height: 420px;
  overflow: auto;
  padding: 10px;
  border-radius: 12px;
  box-sizing: border-box;
  background: var(--color-secondary-bg);
  box-shadow: 0 12px 34px rgb(0 0 0 / 18%);
  z-index: 80;
}

.suggestion-title {
  padding: 6px 10px 8px;
  font-size: 12px;
  font-weight: 700;
  opacity: 0.55;
}

.suggestion-item {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
}

.rank {
  width: 20px;
  flex: none;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  opacity: 0.5;
}

.search-mark {
  color: var(--color-primary);
  opacity: 1;
}

.suggestion-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.word,
.desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.word {
  font-size: 14px;
  font-weight: 600;
}

.desc {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.5;
}
</style>
