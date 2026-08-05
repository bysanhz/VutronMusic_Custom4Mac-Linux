import { ipcMain, type IpcMainEvent } from 'electron'

const INSTALL_KEY = '__vutronLocalTrackIdentityGuardInstalled'

type ScanTrack = {
  id?: number | string
  filePath?: string
  picUrl?: string
  matched?: boolean
  album?: {
    matched?: boolean
    picUrl?: string
  }
}

const readReservedTrackIds = async (): Promise<Set<number>> => {
  const { db, Tables } = await import('../db')
  const ids = new Set<number>()

  for (const row of db.findAll(Tables.Track)) {
    const id = Number(row.id)
    if (Number.isSafeInteger(id) && id > 0) ids.add(id)
  }

  return ids
}

const updateLocalAssetUrls = (track: ScanTrack, id: number): void => {
  track.id = id
  track.picUrl = `atom://local-asset?type=pic&id=${id}`

  if (track.album && track.album.matched !== true) {
    track.album.picUrl = `atom://local-asset?type=pic&id=${id}`
  }
}

const installLocalTrackIdentityGuard = (): void => {
  const target = ipcMain as typeof ipcMain & Record<string, any>
  if (target[INSTALL_KEY]) return
  target[INSTALL_KEY] = true

  const guardedOn = ipcMain.on.bind(ipcMain)
  target.on = (channel: string, listener: (...args: any[]) => unknown) => {
    if (channel !== 'msgScanLocalMusic') return guardedOn(channel, listener)

    return guardedOn(channel, async (event: IpcMainEvent, ...args: unknown[]) => {
      const sender = event.sender as typeof event.sender & Record<string, any>
      const originalSend = sender.send.bind(sender)
      const reservedIds = await readReservedTrackIds()
      let nextId = Math.max(0, ...reservedIds) + 1

      sender.send = (outgoingChannel: string, ...outgoingArgs: unknown[]) => {
        if (outgoingChannel === 'msgHandleScanLocalMusic') {
          const payload = outgoingArgs[0]
          const track =
            payload && typeof payload === 'object'
              ? ((payload as Record<string, unknown>).track as ScanTrack | undefined)
              : undefined

          if (track?.filePath) {
            const proposedId = Number(track.id)
            const proposedIdAvailable =
              Number.isSafeInteger(proposedId) && proposedId > 0 && !reservedIds.has(proposedId)

            if (proposedIdAvailable) {
              reservedIds.add(proposedId)
              nextId = Math.max(nextId, proposedId + 1)
            } else {
              while (reservedIds.has(nextId)) nextId += 1
              updateLocalAssetUrls(track, nextId)
              reservedIds.add(nextId)
              nextId += 1
            }
          }
        }

        return originalSend(outgoingChannel, ...outgoingArgs)
      }

      try {
        return await listener(event, ...args)
      } finally {
        sender.send = originalSend
      }
    })
  }
}

installLocalTrackIdentityGuard()
