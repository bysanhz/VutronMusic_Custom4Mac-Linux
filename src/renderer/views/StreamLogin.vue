<template>
  <div class="stream-container">
    <div class="icon-container">
      <button
        v-for="platform in services"
        :key="platform.name"
        ref="iconWrappers"
        type="button"
        class="icon-wrapper"
        :aria-label="platform.name"
        :aria-pressed="platform.name === currentService"
        @click="selectPlatform(platform.name)"
      >
        <img
          :src="getImagePath(platform.name)"
          :class="{ selected: platform.name === currentService }"
          alt=""
        />
      </button>
      <div class="indicator" :class="{ animated: isIndicatorReady }" :style="indicatorStyle"></div>
    </div>
    <div class="title">{{ currentService }}</div>
    <form class="section-2" @submit.prevent="login">
      <div class="input-box">
        <div class="container" :class="{ active: inputFocus === 'web' }">
          <svg-icon icon-class="web" />
          <div class="inputs">
            <input
              v-model.trim="url"
              type="url"
              autocomplete="url"
              placeholder="主机地址，例如 http://192.168.1.10:4533"
              required
              @focus="inputFocus = 'web'"
              @blur="inputFocus = ''"
            />
          </div>
        </div>
      </div>

      <div class="input-box">
        <div class="container" :class="{ active: inputFocus === 'user' }">
          <svg-icon icon-class="user" />
          <div class="inputs">
            <input
              v-model.trim="user"
              type="text"
              autocomplete="username"
              placeholder="账号"
              required
              @focus="inputFocus = 'user'"
              @blur="inputFocus = ''"
            />
          </div>
        </div>
      </div>

      <div class="input-box">
        <div class="container" :class="{ active: inputFocus === 'password' }">
          <svg-icon icon-class="lock" />
          <div class="inputs">
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              :placeholder="passwordPlaceholder"
              :required="!hasSavedPassword"
              @focus="inputFocus = 'password'"
              @blur="inputFocus = ''"
            />
          </div>
        </div>
      </div>

      <div v-if="hasSavedPassword && !password" class="credential-hint">
        已保存的密码由系统安全存储保护；留空会继续使用该密码。
      </div>

      <div class="confirm">
        <button type="submit" :disabled="submitting">
          {{ submitting ? '正在登录…' : $t('login.login') }}
        </button>
      </div>
      <label v-if="error" class="error-message" role="alert">{{ error }}</label>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import SvgIcon from '../components/SvgIcon.vue'
import { useStreamMusicStore } from '../store/streamingMusic'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { serviceName } from '@/types/music.d'

const iconWrappers = ref<HTMLElement[]>([])
const indicatorStyle = ref({ width: '0px', left: '0px' })
const isIndicatorReady = ref(false)
const currentService = ref<serviceName>('navidrome')

const streamMusicStore = useStreamMusicStore()
const { services } = storeToRefs(streamMusicStore)

const router = useRouter()
const route = useRoute()

const inputFocus = ref('')
const url = ref('')
const user = ref('')
const password = ref('')
const hasSavedPassword = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

const passwordPlaceholder = computed(() =>
  hasSavedPassword.value ? '已保存密码，留空继续使用' : '密码'
)

const getImagePath = (platform: serviceName) => {
  return new URL(`../assets/images/${platform}.png`, import.meta.url).href
}

const updateIndicatorPosition = () => {
  const index = services.value.findIndex((service) => service.name === currentService.value)
  const wrapper = iconWrappers.value[index]
  const container = wrapper?.parentElement

  if (wrapper && container) {
    const containerRect = container.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()

    indicatorStyle.value = {
      width: `${wrapperRect.width}px`,
      left: `${wrapperRect.left - containerRect.left}px`
    }
  }
}

const loadAccountSummary = async (platform: serviceName) => {
  error.value = null
  password.value = ''

  try {
    const result = await window.mainApi?.invoke('get-stream-account', { platform })
    url.value = result?.url || ''
    user.value = result?.username || ''
    hasSavedPassword.value = Boolean(result?.hasPassword)
  } catch (reason) {
    hasSavedPassword.value = false
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

const selectPlatform = (platform: serviceName) => {
  currentService.value = platform
  nextTick(updateIndicatorPosition)
}

const login = async () => {
  if (submitting.value) return
  if (!url.value || !user.value || (!password.value && !hasSavedPassword.value)) {
    error.value = '请完整填写主机地址、账号和密码。'
    return
  }

  submitting.value = true
  error.value = null

  try {
    const response = await window.mainApi?.invoke('stream-login', {
      platform: currentService.value,
      baseURL: url.value,
      username: user.value,
      password: password.value
    })

    if (response?.code === 200) {
      services.value = services.value.map((service) =>
        service.name === currentService.value ? { ...service, status: 'login' } : service
      )
      password.value = ''
      hasSavedPassword.value = true
      await router.push('/stream')
    } else {
      error.value = response?.message || '登录失败，请检查服务器地址和凭据。'
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    submitting.value = false
  }
}

watch(currentService, async (value) => {
  const service = services.value.find((item) => item.name === value)
  if (service?.status === 'login') {
    await router.push('/stream')
    return
  }
  await loadAccountSummary(value)
})

onMounted(async () => {
  currentService.value = (route.params.service as serviceName) || 'jellyfin'
  await loadAccountSummary(currentService.value)
  window.addEventListener('resize', updateIndicatorPosition)
  await nextTick()
  updateIndicatorPosition()
  window.setTimeout(() => {
    isIndicatorReady.value = true
  }, 100)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIndicatorPosition)
})
</script>

<style scoped lang="scss">
.stream-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.icon-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 80px;
  gap: 0 4rem;

  .icon-wrapper {
    position: relative;
    cursor: pointer;
    padding: 0;
    border: 0;
    background: transparent;

    &:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 4px;
      border-radius: 10px;
    }
  }

  img {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    height: 64px;
    transform: scale(0.7);
    opacity: 0.8;

    &.selected {
      transform: scale(1);
      opacity: 1;
    }
  }

  .indicator {
    position: absolute;
    bottom: -10px;
    height: 6px;
    background-color: var(--color-primary);
    border-radius: 2px;
    transition: none;

    &.animated {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
  }
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-top: 48px;
}

.section-2 {
  display: flex;
  align-items: center;
  flex-direction: column;
  margin-top: 30px;

  .input-box {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 16px;
    color: var(--color-text);

    .container {
      display: flex;
      align-items: center;
      height: 46px;
      background: var(--color-secondary-bg);
      border-radius: 8px;
      width: min(400px, calc(100vw - 48px));
    }

    .svg-icon {
      height: 18px;
      width: 18px;
      color: #969696;
      margin: 0 6px 0 12px;
    }

    .inputs {
      display: flex;
      width: 85%;

      input {
        font-size: 16px;
        border: none;
        background: transparent;
        width: 100%;
        font-weight: 600;
        margin-top: -1px;
        padding-left: 4px;
        color: var(--color-text);
      }
    }

    .active {
      background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
      input,
      .svg-icon {
        color: var(--color-primary);
      }
    }
  }

  .credential-hint {
    width: min(400px, calc(100vw - 48px));
    margin-top: -6px;
    color: color-mix(in srgb, var(--color-text), transparent 35%);
    font-size: 12px;
    line-height: 1.5;
  }

  .confirm button {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 600;
    background: color-mix(in oklab, var(--color-primary) var(--bg-alpha), white);
    color: var(--color-primary);
    border-radius: 8px;
    margin: 20px 0;
    transition: 0.2s;
    padding: 8px;
    width: min(400px, calc(100vw - 48px));

    &:hover:not(:disabled) {
      transform: scale(1.02);
    }
    &:active:not(:disabled) {
      transform: scale(0.98);
    }
    &:disabled {
      cursor: wait;
      opacity: 0.55;
    }
  }

  .error-message {
    width: min(400px, calc(100vw - 48px));
    color: #d33;
    line-height: 1.5;
  }
}
</style>
