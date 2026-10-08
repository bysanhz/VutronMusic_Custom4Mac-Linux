import { createApp, h, nextTick, ref } from 'vue'
import LyricLine from '../../../src/renderer/components/LyricLine.vue'

let unmount = () => {}
const line = ref<InstanceType<typeof LyricLine>>()
const mount = async (isMini = false) => {
  unmount()
  const word = { word: 'A long lyric line for the resource regression test', start: 0, end: 200000 }
  const item = {
    start: 0,
    end: 200,
    lyric: { text: word.word, info: [word] },
    tlyric: { text: word.word, info: [word] }
  }
  const app = createApp({
    render: () =>
      h(LyricLine, {
        ref: line,
        item,
        idx: 0,
        currentIndex: 0,
        translationMode: 'tlyric',
        playing: false,
        isWordByWord: true,
        isMini
      })
  })
  app.mount('#probe')
  unmount = () => app.unmount()
  await nextTick()
  // Force overflow so mini mode also exercises its two scroll animations.
  document.querySelectorAll<HTMLElement>('.lyric-line, .translation').forEach((element) => {
    element.style.width = '120px'
    const span = element.querySelector('span')!
    span.style.display = 'inline-block'
    span.style.width = 'max-content'
  })
}

;(window as any).memoryProbe = { line, mount, unmount: () => unmount() }
void mount()
