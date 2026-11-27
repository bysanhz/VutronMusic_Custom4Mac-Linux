export type BuildInfo = { version: string; revision: string; builtAt: string; modified: boolean }
declare const __VUTRON_BUILD_INFO__: BuildInfo | undefined
export const BUILD_INFO: BuildInfo =
  typeof __VUTRON_BUILD_INFO__ === 'undefined'
    ? { version: 'development', revision: 'unknown', builtAt: '', modified: false }
    : __VUTRON_BUILD_INFO__
