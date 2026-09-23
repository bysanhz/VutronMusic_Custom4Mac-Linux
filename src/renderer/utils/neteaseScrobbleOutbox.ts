import type { ScrobbleParams } from '../api/track'

export type NeteaseScrobbleJob = {
  id: string
  createdAt: number
  params: ScrobbleParams
}

const STORAGE_KEY = 'vutronmusic-netease-scrobble-outbox-v1'
const MAX_JOBS = 500

const readJobs = (): NeteaseScrobbleJob[] => {
  if (typeof localStorage === 'undefined') return []
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((job) => {
      const id = Number(job?.params?.id)
      const time = Number(job?.params?.time)
      return typeof job?.id === 'string' && Number.isFinite(id) && id > 0 && time > 0
    })
  } catch {
    return []
  }
}

let jobs = readJobs()

const persist = (): void => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch (error) {
    console.warn('[NetEaseScrobbleOutbox] 保存待重试记录失败：', error)
  }
}

const createJobId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const enqueueNeteaseScrobble = (params: ScrobbleParams): NeteaseScrobbleJob => {
  const job: NeteaseScrobbleJob = {
    id: createJobId(),
    createdAt: Date.now(),
    params: { ...params }
  }
  jobs = [...jobs, job].slice(-MAX_JOBS)
  persist()
  return job
}

export const listNeteaseScrobbleJobs = (): NeteaseScrobbleJob[] =>
  jobs.map((job) => ({ ...job, params: { ...job.params } }))

export const removeNeteaseScrobbleJob = (jobId: string): void => {
  const next = jobs.filter((job) => job.id !== jobId)
  if (next.length === jobs.length) return
  jobs = next
  persist()
}
