<template>
  <div ref="rootRef" class="select-wrapper">
    <div class="custom-select" @click="toggleDropdown">
      <span class="custom-text" :style="selectedOptionStyle" @click.stop="toggleDropdown">
        <slot name="selected" :option="selectedOption">
          {{ selectedLabel }}
        </slot>
      </span>
      <span class="custom-icon"
        ><svg-icon
          icon-class="dropdown"
          :style="{ transform: dropdownVisible ? 'scaleY(-1)' : 'scaleY(1)' }"
      /></span>
    </div>
    <div
      v-if="dropdownVisible"
      ref="dropdownRef"
      class="custom-dropdown"
      :class="{ 'dropdown-up': dropdownPosition === 'up' }"
      :style="dropdownStyle"
    >
      <!-- ======== newADD start====== -->
      <!--
        可搜索下拉框使用独立搜索栏。

        旧实现会在展开时直接把当前选中值替换成输入框，搜索入口不明显，
        用户也难以区分“当前字体”和“搜索关键字”。独立搜索栏可以始终保留
        当前选中项显示，同时明确提示可输入字体名称。
      -->
      <div v-if="searchable" class="custom-search" @click.stop>
        <input
          ref="searchInputRef"
          v-model="searchKeyword"
          class="custom-search-input"
          :placeholder="searchPlaceholder"
          @input="onSearchInput"
          @keydown="onKeyDown"
          @click.stop
        />
      </div>
      <!-- =========== newADD end ======== -->
      <div v-if="filteredOptions.length === 0" class="no-data-item">
        {{ noDataText }}
      </div>
      <div
        v-for="(option, index) in filteredOptions"
        :key="String(option.value)"
        :data-option-index="index"
        class="custom-select-item"
        :class="{
          active: option.value === hoverValue,
          highlighted: index === highlightedIndex
        }"
        :style="getOptionStyle(option)"
        @mouseover="onMouseOver(option.value, index)"
        @click="selectOption(option.value)"
      >
        <slot name="option" :option="option">
          <div>{{ option.label }}</div>
        </slot>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed, watch, ref, nextTick } from 'vue'
import SvgIcon from './SvgIcon.vue'
import { useNormalStateStore } from '../store/state'
import { storeToRefs } from 'pinia'

// ======== newADD start======
type SelectOption = {
  label: string
  value: string | number | boolean
  /** 选项预览使用的真实 CSS 字体族。 */
  fontFamily?: string
  /** 除 label/value 外可参与搜索的文本。 */
  searchText?: string
}
// =========== newADD end ========

const props = withDefaults(
  defineProps<{
    modelValue: string | number | boolean | null | undefined
    options: SelectOption[]
    searchable?: boolean
    noDataText?: string
    placeholder?: string
    // ======== newADD start======
    searchPlaceholder?: string
    // =========== newADD end ========
    direction?: 'auto' | 'up' | 'down'
    filterMethod?: (keyword: string, option: SelectOption) => boolean
  }>(),
  {
    searchable: false,
    placeholder: '请选择',
    noDataText: '暂无数据',
    // ======== newADD start======
    searchPlaceholder: '搜索...',
    // =========== newADD end ========
    direction: 'auto',
    filterMethod: undefined
  }
)

const $emit = defineEmits<{
  (e: 'update:modelValue', value: string | number | boolean): void
  (e: 'search', keyword: string): void
}>()

const { enableScrolling } = storeToRefs(useNormalStateStore())

const rootRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

const dropdownVisible = ref(false)
const hoverValue = ref(props.modelValue)
const dropdownPosition = ref<'down' | 'up'>('down')
const dropdownStyle = ref<Record<string, string>>({})
const searchKeyword = ref('')
const highlightedIndex = ref(-1)

const defaultFilterMethod = (keyword: string, option: SelectOption) => {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  const searchableText = [option.label, String(option.value), option.searchText ?? '']
    .join(' ')
    .toLocaleLowerCase()

  return searchableText.includes(normalizedKeyword)
}

const filteredOptions = computed(() => {
  if (!props.searchable || !searchKeyword.value.trim()) {
    return props.options
  }

  const filterFn = props.filterMethod || defaultFilterMethod
  return props.options.filter((option) => filterFn(searchKeyword.value, option))
})

// ======== newADD start======
const selectedOption = computed(() => {
  return props.options.find((option) => option.value === props.modelValue)
})
// =========== newADD end ========

const selectedLabel = computed(() => {
  return selectedOption.value ? selectedOption.value.label : props.placeholder
})

// ======== newADD start======
/**
 * 返回字体预览选项的内联样式。
 *
 * Args:
 *   option: 当前下拉选项。
 *
 * Returns:
 *   字体选项返回 font-family，其余选项返回空对象。
 *
 * Raises:
 *   不抛出异常。
 */
const getOptionStyle = (option: SelectOption): Record<string, string> => {
  return option.fontFamily ? { fontFamily: option.fontFamily } : {}
}

/** 当前已选择项的字体预览样式。 */
const selectedOptionStyle = computed<Record<string, string>>(() => {
  return selectedOption.value ? getOptionStyle(selectedOption.value) : {}
})
// =========== newADD end ========

const calculateDropdownPosition = async () => {
  if (!rootRef.value || !dropdownRef.value) return
  await nextTick()
  const selectRect = rootRef.value.getBoundingClientRect()
  const dropdownHeight = dropdownRef.value.offsetHeight
  const viewportHeight = window.innerHeight

  const spaceBelow = viewportHeight - selectRect.bottom
  const spaceAbove = selectRect.top

  if (
    props.direction === 'up' ||
    (props.direction === 'auto' && spaceBelow < dropdownHeight && spaceAbove > spaceBelow)
  ) {
    dropdownPosition.value = 'up'
    dropdownStyle.value = {
      bottom: '100%',
      top: 'auto',
      maxHeight: `${Math.min(300, spaceAbove)}px`
    }
  } else if (props.direction === 'down' || props.direction === 'auto') {
    dropdownPosition.value = 'down'
    dropdownStyle.value = {
      top: '100%',
      bottom: 'auto',
      maxHeight: `${Math.min(300, spaceBelow)}px`
    }
  }

  const selectLeft = selectRect.left
  const selectWidth = selectRect.width
  const viewportWidth = window.innerWidth

  if (selectLeft + selectWidth > viewportWidth - 20) {
    dropdownStyle.value.right = '0'
    dropdownStyle.value.left = 'auto'
  } else if (selectLeft < 20) {
    dropdownStyle.value.left = '0'
    dropdownStyle.value.right = 'auto'
  }
}

const toggleDropdown = async () => {
  dropdownVisible.value = !dropdownVisible.value

  if (dropdownVisible.value) {
    await nextTick()
    calculateDropdownPosition()

    if (props.searchable) {
      await nextTick()
      searchInputRef.value?.focus()
    }
  } else {
    resetSearch()
  }
}

const selectOption = (value: string | number | boolean) => {
  $emit('update:modelValue', value)
  dropdownVisible.value = false
  resetSearch()
}

const resetSearch = () => {
  searchKeyword.value = ''
  highlightedIndex.value = -1
}

const onSearchInput = async () => {
  highlightedIndex.value = -1
  $emit('search', searchKeyword.value)
  await nextTick()
  calculateDropdownPosition()
}

const onMouseOver = (value: string | number | boolean, index: number) => {
  hoverValue.value = value
  highlightedIndex.value = index
}

// ======== newADD start======
/**
 * 将键盘高亮项滚动到下拉框可视区域。
 *
 * Returns:
 *   无返回值。
 *
 * Raises:
 *   目标元素不存在时静默跳过。
 */
const scrollHighlightedOptionIntoView = async () => {
  await nextTick()
  const optionElement = dropdownRef.value?.querySelector<HTMLElement>(
    `[data-option-index="${highlightedIndex.value}"]`
  )
  optionElement?.scrollIntoView({ block: 'nearest' })
}
// =========== newADD end ========

const onKeyDown = async (event: KeyboardEvent) => {
  const optionsLength = filteredOptions.value.length

  if (optionsLength === 0) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      highlightedIndex.value =
        highlightedIndex.value < optionsLength - 1 ? highlightedIndex.value + 1 : 0
      hoverValue.value = filteredOptions.value[highlightedIndex.value]?.value
      await scrollHighlightedOptionIntoView()
      break

    case 'ArrowUp':
      event.preventDefault()
      highlightedIndex.value =
        highlightedIndex.value > 0 ? highlightedIndex.value - 1 : optionsLength - 1
      hoverValue.value = filteredOptions.value[highlightedIndex.value]?.value
      await scrollHighlightedOptionIntoView()
      break

    case 'Enter':
      event.preventDefault()
      if (highlightedIndex.value >= 0) {
        selectOption(filteredOptions.value[highlightedIndex.value].value)
      }
      break

    case 'Escape':
      event.preventDefault()
      dropdownVisible.value = false
      resetSearch()
      break
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    dropdownVisible.value = false
    resetSearch()
  }
}

const handleScroll = () => {
  if (dropdownVisible.value) {
    calculateDropdownPosition()
  }
}

const handleResize = () => {
  if (dropdownVisible.value) {
    calculateDropdownPosition()
  }
}

const closeDropdown = () => {
  dropdownVisible.value = false
  resetSearch()
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    closeDropdown()
  }
}

watch(dropdownVisible, (visible) => {
  if (visible) {
    enableScrolling.value = false
    hoverValue.value = props.modelValue
    document.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    window.addEventListener('blur', closeDropdown)
    window.addEventListener('visibilitychange', handleVisibilityChange)
  } else {
    enableScrolling.value = true
    document.removeEventListener('click', handleClickOutside)
    window.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('blur', closeDropdown)
    window.removeEventListener('visibilitychange', handleVisibilityChange)
    dropdownStyle.value = {}
  }
})
</script>

<style lang="scss" scoped>
.select-wrapper {
  position: relative;
  width: 100%;
}

.custom-select {
  display: flex;
  background: var(--color-secondary-bg);
  min-width: 150px;
  height: 40px;
  box-sizing: border-box;
  border-radius: 8px;
  padding: 0 12px;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.custom-select .custom-text {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
  width: 100%;
  user-select: none;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-select .custom-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  flex-shrink: 0;
}

.custom-dropdown {
  position: absolute;
  left: 0;
  width: 100%;
  background: var(--color-secondary-bg);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
  z-index: 10000;
  overflow: auto;

  // 默认向下展开
  top: 100%;

  &.dropdown-up {
    // 向上展开时的样式调整
    bottom: 100%;
    top: auto;
  }
}

/* ======== newADD start====== */
.custom-search {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px;
  background: var(--color-secondary-bg);
  border-bottom: 1px solid var(--color-border);
}

.custom-search-input {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  outline: none;
  background: var(--color-body-bg, rgba(127, 127, 127, 0.08));
  color: var(--color-text);
  font-size: 14px;

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 18%, transparent);
  }

  &::placeholder {
    color: var(--color-text-secondary);
  }
}
/* =========== newADD end ======== */

.custom-select-item {
  padding: 8px 12px;
  cursor: pointer;
  color: var(--color-text);
  text-align: center;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover,
  &.highlighted {
    background-color: var(--color-primary);
    color: white;
  }

  &:first-child {
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
  }

  &:last-child {
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
}

/* ======== newADD start====== */
/*
 * 字体选项槽位中旧代码可能仍设置 PostScript 名称。
 * 继承父项上已经解析完成的 familyName，并用 important 覆盖旧内联值。
 */
:deep(.custom-select-item > *) {
  font-family: inherit !important;
}
/* =========== newADD end ======== */

.custom-select-item.active {
  background-color: var(--color-primary);
  color: white;
}

.no-data-item {
  padding: 12px;
  color: var(--color-text-secondary);
  text-align: center;
  font-size: 14px;
  font-style: italic;
}

.custom-dropdown::-webkit-scrollbar {
  width: 0px;
}

.custom-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.custom-dropdown::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: 3px;

  &:hover {
    background-color: var(--color-text-secondary);
  }
}
</style>
