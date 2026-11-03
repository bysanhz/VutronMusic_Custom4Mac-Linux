import { test, expect } from '@playwright/test'
import { selectVerifiedAudioCandidate, audioIdentityMismatch } from '../src/shared/audioIdentity'
import { cachedAudioMismatch } from '../src/main/utils/cachedAudioIdentity'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const evidence = JSON.parse(readFileSync('tests/fixtures/audio-identity/luori-kuwo.json', 'utf8'))
const expected = evidence.expected
const correct = { id: 'correct', name: expected.name, artists: expected.artists, duration: 189000 }

test('captured Bodian search reproduces 雨爱 for 落日微风; verified selection rejects every wrong hit', () => {
  const oldSelect = require('@unblockneteasemusic/server/src/provider/select')
  expect(oldSelect(evidence.candidates, expected).name).toBe('雨爱')
  expect(selectVerifiedAudioCandidate(evidence.candidates, expected)).toBeUndefined()
})

test('identity outranks duration and search position, including a correct hit after position five', () => {
  const wrong = { ...correct, name: '雨爱', duration: 188672 }
  expect(selectVerifiedAudioCandidate([...Array(6).fill(wrong), correct], expected)).toBe(correct)
  expect(
    selectVerifiedAudioCandidate([{ ...correct, artists: [{ name: '野生君子' }] }], expected)
  ).toBeUndefined()
})

test('rejects alternate recordings and unknown identities but permits typography and missing provider duration', () => {
  for (const suffix of [' (Live)', '（伴奏）', ' Remix', ' (Cover)'])
    expect(
      selectVerifiedAudioCandidate([{ ...correct, name: correct.name + suffix }], expected)
    ).toBeUndefined()
  expect(selectVerifiedAudioCandidate([{ ...correct, duration: 259500 }], expected)).toBeUndefined()
  expect(selectVerifiedAudioCandidate([{ ...correct, artists: [] }], expected)).toBeUndefined()
  expect(
    selectVerifiedAudioCandidate(
      [{ ...correct, name: ' 落日 微风 ', duration: undefined }],
      expected
    )
  ).toBeTruthy()
  expect(
    audioIdentityMismatch(
      { name: 'Ａ Song', artists: [{ name: 'Artist' }] },
      { name: 'a song', artists: [{ name: 'artist' }] }
    )
  ).toBeNull()
})

const chunk = (id: string, bytes: Buffer) => {
  const header = Buffer.alloc(8)
  header.write(id)
  header.writeUInt32LE(bytes.length, 4)
  return Buffer.concat([header, bytes, Buffer.alloc(bytes.length % 2)])
}
const wav = (name = 'Wrong song') => {
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1)
  fmt.writeUInt16LE(1, 2)
  fmt.writeUInt32LE(8000, 4)
  fmt.writeUInt32LE(16000, 8)
  fmt.writeUInt16LE(2, 12)
  fmt.writeUInt16LE(16, 14)
  const content = Buffer.concat([
    Buffer.from('WAVE'),
    chunk('fmt ', fmt),
    chunk(
      'LIST',
      Buffer.concat([
        Buffer.from('INFO'),
        chunk('INAM', Buffer.from(name + '\0')),
        chunk('IART', Buffer.from('Demo Artist\0'))
      ])
    ),
    chunk('data', Buffer.alloc(16000))
  ])
  const header = Buffer.alloc(8)
  header.write('RIFF')
  header.writeUInt32LE(content.length, 4)
  return Buffer.concat([header, content])
}

test('legacy cache is checked against bytes, not the expected song name in its filename', async () => {
  const dir = mkdtempSync(resolve('tmp/audio-cache-identity-'))
  try {
    const file = join(dir, 'expected-song.wav')
    writeFileSync(file, wav())
    expect(
      await cachedAudioMismatch({
        name: 'Expected song',
        artists: [{ name: 'Demo Artist' }],
        dt: 1000,
        url: file
      })
    ).toBe('title_mismatch')
    expect(
      await cachedAudioMismatch({
        name: 'Wrong song',
        artists: [{ name: 'Demo Artist' }],
        dt: 1000,
        url: file
      })
    ).toBeNull()
    expect(
      await cachedAudioMismatch({
        name: 'Wrong song',
        artists: [{ name: 'Demo Artist' }],
        dt: 9000,
        url: file
      })
    ).toBe('duration_mismatch')
    expect(existsSync(file)).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cache worker refuses mismatched bytes before rewriting tags or writing a cache file', async () => {
  const dir = mkdtempSync(resolve('tmp/audio-worker-identity-'))
  try {
    const output = join(dir, 'worker.cjs')
    await build({
      entryPoints: ['src/main/workers/cacheTrack.ts'],
      outfile: output,
      bundle: true,
      platform: 'node',
      external: ['music-metadata', 'file-type', 'taglib-wasm'],
      plugins: [
        {
          name: 'fixture-audio',
          setup(b) {
            b.onLoad({ filter: /cacheTrack\.ts$/ }, async (a) => ({
              contents: readFileSync(a.path, 'utf8') + '\nexport {runCacheTask};',
              loader: 'ts'
            }))
            b.onLoad({ filter: /workerHttp\.ts$/ }, async () => ({
              contents: `export async function downloadPublicBuffer(){return {buffer:Buffer.from(globalThis.__audio,'base64'),contentType:'audio/wav',url:'https://example.com/audio.wav'}}`,
              loader: 'js'
            }))
          }
        }
      ]
    })
    const code = `(async()=>{globalThis.__audio=${JSON.stringify(wav().toString('base64'))};const {runCacheTask}=require(${JSON.stringify(output)});try{await runCacheTask({id:1,name:'Expected song',artists:[{name:'Demo Artist'}],dt:1000},'https://example.com/audio.wav',${JSON.stringify(dir)});process.exitCode=2}catch(e){if(!e.message.includes('AUDIO_IDENTITY_TITLE_MISMATCH'))throw e;console.log('rejected-before-write')}const good=await runCacheTask({id:2,name:'Wrong song',artists:[{name:'Demo Artist'}],album:{name:'Demo album'},dt:1000,source:'bodian'},'https://example.com/audio.wav',${JSON.stringify(dir)});if(!good.cache||good.source!=='bodian'||!require('fs').existsSync(good.url))throw Error('valid cache lost');console.log('valid-cache-preserved')})().catch(e=>{console.error(e);process.exitCode=1})`
    expect(execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' })).toContain(
      'rejected-before-write'
    )
    expect(existsSync(join(dir, '1-320000-Expected song.wav'))).toBe(false)
    expect(existsSync(join(dir, '2-320000-Wrong song.wav'))).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const mode of ['baseline', 'verified']) {
  test(`real UNM Bodian module: ${mode} keeps identity across a wrong first result and a later exact match`, async () => {
    const dir = mkdtempSync(resolve('tmp/unblock-module-'))
    try {
      const adapter = join(dir, 'adapter.cjs')
      await build({
        entryPoints: ['src/main/utils/unblockMatcher.ts'],
        outfile: adapter,
        bundle: true,
        platform: 'node'
      })
      const script = join(dir, 'probe.cjs')
      writeFileSync(
        script,
        `
        process.env.FOLLOW_SOURCE_ORDER='true';const assert=require('assert/strict');
        const requestPath=require.resolve('@unblockneteasemusic/server/src/request');require(requestPath);
        let chosen=[], includeCorrect=false;
        require.cache[requestPath].exports=async(method,url)=>({statusCode:200,url:new URL(url),headers:{'content-length':'8192'},body:async()=>Buffer.alloc(8192),json:async()=>{
          if(url.includes('search.kuwo.cn')){let list=${JSON.stringify(evidence.candidates)};if(includeCorrect)list=[...list,${JSON.stringify(correct)}];return {content:[{}, {musicpage:{abslist:list.map(t=>({MUSICRID:'MUSIC_'+t.id,SONGNAME:t.name,DURATION:t.duration/1000,ALBUM:t.album?.name||'',ARTIST:t.artists.map(a=>a.name).join('&')}))}}]}}
          if(url.includes('/audioUrl')){chosen.push(new URL(url).searchParams.get('musicId'));return {code:200,data:{audioUrl:'https://example.com/audio.flac'}}}return {};
        }});
        (async()=>{const data=${JSON.stringify(expected)};const run=${mode === 'baseline' ? "()=>require('@unblockneteasemusic/server')(data.id,['bodian'],data)" : `()=>require(${JSON.stringify(adapter)}).matchVerifiedUnblock(data,['bodian'])`};
          ${mode === 'baseline' ? "await run();assert.deepEqual(chosen,['463949837']);" : "await assert.rejects(run());assert.deepEqual(chosen,[]);includeCorrect=true;await run();assert.deepEqual(chosen,['correct']);"}
          console.log('identity-control-passed');
        })().catch(e=>{console.error(e);process.exitCode=1});
      `
      )
      expect(
        execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 })
      ).toContain('identity-control-passed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('parallel providers cannot borrow another provider validation receipt; unverified video hits are rejected', async () => {
  const dir = mkdtempSync(resolve('tmp/unblock-isolation-'))
  try {
    const adapter = join(dir, 'adapter.cjs')
    await build({
      entryPoints: ['src/main/utils/unblockMatcher.ts'],
      outfile: adapter,
      bundle: true,
      platform: 'node'
    })
    const script = join(dir, 'probe.cjs')
    writeFileSync(
      script,
      `
      process.env.FOLLOW_SOURCE_ORDER='';const assert=require('assert/strict');
      const requestPath=require.resolve('@unblockneteasemusic/server/src/request');require(requestPath);
      const spawnPath=require.resolve('@unblockneteasemusic/server/src/spawn');require(spawnPath);
      require.cache[spawnPath].exports.spawnStdout=async()=>{await new Promise(r=>setTimeout(r,10));return {stdout:Buffer.from(JSON.stringify({id:'video',url:'https://example.com/unsafe.flac'}))}};
      let unsafeProbes=0;
      require.cache[requestPath].exports=async(method,url)=>{
        if(url.includes('unsafe.flac'))unsafeProbes++;
        if(url.includes('safe.flac'))await new Promise(r=>setTimeout(r,30));
        return {statusCode:200,url:new URL(url),headers:{'content-length':'8192'},body:async()=>Buffer.alloc(8192),json:async()=>{
          if(url.includes('search.kuwo.cn'))return {content:[{}, {musicpage:{abslist:[{MUSICRID:'MUSIC_correct',SONGNAME:'落日微风',DURATION:189,ALBUM:'落日微风',ARTIST:'张德伊玲'}]}}]};
          if(url.includes('/audioUrl'))return {code:200,data:{audioUrl:'https://example.com/safe.flac'}};
          return {};
        }};
      };
      (async()=>{const result=await require(${JSON.stringify(adapter)}).matchVerifiedUnblock(${JSON.stringify(expected)},['bodian','ytdlp']);assert.equal(result.url,'https://example.com/safe.flac');assert.equal(unsafeProbes,0);console.log('receipt-isolation-passed')})().catch(e=>{console.error(e);process.exitCode=1});
    `
    )
    expect(
      execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 })
    ).toContain('receipt-isolation-passed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
