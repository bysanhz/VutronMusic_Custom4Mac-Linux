// For fix typescript import errors
declare module '*.vue' {
  import { defineComponent } from 'vue'
  const component: ReturnType<typeof defineComponent>
  export default component
}

declare module '*.dataurl?raw' {
  const content: string
  export default content
}
