<template>
  <div class="container">
    <textarea
      v-model="comment"
      class="comment-input"
      :placeholder="placeholder || t('comments.inputPlaceholder')"
      @keydown.enter="handleEnterKey"
    ></textarea>
    <button class="comment-button" @click="submitComment">{{ t('comments.send') }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  placeholder: { type: String, default: '' }
})

const $emit = defineEmits(['keydown-enter'])
const comment = ref<string>('')

const handleEnterKey = (event: KeyboardEvent) => {
  if (event.code === 'Enter' && event.metaKey) {
    submitComment()
  }
}
const submitComment = () => {
  $emit('keydown-enter')
}

defineExpose({ comment })
</script>

<style scoped lang="scss">
.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 44px;

  .comment-input {
    color: var(--text-color);
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    font-size: 14px;
    resize: none;
    border: none;
    outline: none;
    border-radius: 8px 0 0 8px;
    padding: 6px 12px;
    scrollbar-width: none;
    background: var(--color-secondary-bg-for-transparent);
  }
  .comment-input::placeholder {
    opacity: 0.6;
    color: var(--text-color);
  }
  .comment-button {
    height: 100%;
    border-radius: 0 8px 8px 0;
    box-sizing: border-box;
    width: 80px;
    margin-left: 1px;
    color: var(--text-color);
    background: var(--color-secondary-bg-for-transparent);
  }
}
</style>
