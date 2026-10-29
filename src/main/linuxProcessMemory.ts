import { readdirSync, readFileSync } from 'fs'

/**
 * Read-only Linux process memory snapshot for one-click diagnostics.
 *
 * RSS is resident memory and includes shared pages in each process; summing
 * RSS across processes can double-count. PSS allocates shared pages
 * proportionally and is preferable for comparing a multi-process Electron app.
 *
 * Only numeric /proc status and smaps_rollup fields are read. Command lines,
 * environment variables, executable paths, and memory maps are never copied
 * into the diagnostic output.
 */
type LinuxStatus = {
  ppid: number
  rssKiB: number | null
  virtualKiB: number | null
  anonymousKiB: number | null
}

const readField = (content: string, name: string): number | null => {
  const match = content.match(new RegExp(`^${name}:\\s*(\\d+)(?:\\s*kB)?$`, 'm'))
  return match ? Number(match[1]) : null
}

export const parseLinuxProcessStatus = (content: string): LinuxStatus | null => {
  const ppid = readField(content, 'PPid')
  if (ppid === null) return null
  return {
    ppid,
    rssKiB: readField(content, 'VmRSS'),
    virtualKiB: readField(content, 'VmSize'),
    anonymousKiB: readField(content, 'RssAnon')
  }
}

const toMiB = (value: number | null): number | null =>
  value === null ? null : Math.round((value / 1024) * 100) / 100

export type LinuxMemoryRecord = {
  pid: number
  parentPid: number
  electronReported: boolean
  residentMiB: number | null
  proportionalMiB: number | null
  virtualMiB: number | null
  anonymousMiB: number | null
}

export type LinuxProcessMemorySnapshot = {
  processCount: number
  electronReportedProcessCount: number
  residentSumMiB: number
  proportionalSumMiB: number | null
  proportionalMeasuredProcessCount: number
  largestProcesses: LinuxMemoryRecord[]
}

export const readLinuxAppProcessMemory = (
  rootPid: number,
  electronPids: readonly number[],
  procDirectory = '/proc'
): LinuxProcessMemorySnapshot | null => {
  let pids: number[]
  try {
    pids = readdirSync(procDirectory)
      .filter((entry) => /^\d+$/.test(entry))
      .map(Number)
  } catch {
    return null
  }

  const statusByPid = new Map<number, LinuxStatus>()
  const childrenByPid = new Map<number, number[]>()
  for (const pid of pids) {
    try {
      const content = readFileSync(`${procDirectory}/${pid}/status`, 'utf8')
      const status = parseLinuxProcessStatus(content)
      if (!status) continue
      statusByPid.set(pid, status)
      const siblings = childrenByPid.get(status.ppid) || []
      siblings.push(pid)
      childrenByPid.set(status.ppid, siblings)
    } catch {
      // Processes exit during traversal; unreadable /proc data is expected.
    }
  }

  if (!statusByPid.has(rootPid)) return null
  const visited = new Set<number>()
  const pending = [rootPid]
  const members: number[] = []
  while (pending.length && members.length < 128) {
    const pid = pending.pop()!
    if (visited.has(pid)) continue
    visited.add(pid)
    if (!statusByPid.has(pid)) continue
    members.push(pid)
    pending.push(...(childrenByPid.get(pid) || []))
  }

  const electronSet = new Set(electronPids)
  const records: LinuxMemoryRecord[] = members.map((pid) => {
    const status = statusByPid.get(pid)!
    let pssKiB: number | null = null
    try {
      // smaps_rollup is only read for our own process tree, not every PID.
      pssKiB = readField(readFileSync(`${procDirectory}/${pid}/smaps_rollup`, 'utf8'), 'Pss')
    } catch {
      // Permission/availability varies by kernel and sandbox.
    }
    return {
      pid,
      parentPid: status.ppid,
      electronReported: electronSet.has(pid),
      residentMiB: toMiB(status.rssKiB),
      proportionalMiB: toMiB(pssKiB),
      virtualMiB: toMiB(status.virtualKiB),
      anonymousMiB: toMiB(status.anonymousKiB)
    }
  })
  const measuredPss = records.filter((record) => record.proportionalMiB !== null)
  const sum = (items: (number | null)[]): number =>
    Math.round(items.reduce<number>((total, current) => total + (current ?? 0), 0) * 100) / 100

  return {
    processCount: records.length,
    electronReportedProcessCount: records.filter((record) => record.electronReported).length,
    residentSumMiB: sum(records.map((record) => record.residentMiB)),
    proportionalSumMiB: measuredPss.length === records.length
      ? sum(records.map((record) => record.proportionalMiB))
      : null,
    proportionalMeasuredProcessCount: measuredPss.length,
    largestProcesses: records
      .sort((a, b) => (b.residentMiB ?? 0) - (a.residentMiB ?? 0))
      .slice(0, 24)
  }
}
