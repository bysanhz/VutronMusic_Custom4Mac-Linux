import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { prepareNeteaseRequestParams } from '../src/main/appServer/neteaseRequestParams'

test('audio protocol adaptation preserves explicit options and other endpoints', () => {
  const query = { id: '123', level: 'hires' }
  const cookie = { MUSIC_U: 'test-account' }
  expect(prepareNeteaseRequestParams('song/url/v1', query, cookie)).toEqual({
    ...query,
    crypto: 'eapi',
    cookie
  })
  expect(query).not.toHaveProperty('crypto')
  expect(
    prepareNeteaseRequestParams('song/url/v1', { ...query, crypto: 'xeapi' }, cookie).crypto
  ).toBe('xeapi')
  expect(prepareNeteaseRequestParams('song/detail', { ids: '123' }, cookie)).not.toHaveProperty(
    'crypto'
  )
})

test('real API handler obtains an official audio response without CLI XEAPI initialization', async () => {
  const dir = mkdtempSync(resolve('tmp/netease-audio-protocol-'))
  try {
    const adapter = join(dir, 'params.cjs')
    await build({
      entryPoints: ['src/main/appServer/neteaseRequestParams.ts'],
      outfile: adapter,
      platform: 'node',
      bundle: true
    })
    const script = join(dir, 'probe.cjs')
    writeFileSync(
      script,
      `
      const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
      require('node:os').tmpdir=()=>${JSON.stringify(dir)};
      fs.writeFileSync(path.join(${JSON.stringify(dir)},'anonymous_token'),'');
      const apiRoot=path.dirname(require.resolve('@neteasecloudmusicapienhanced/api/package.json'));
      const axios=require(require.resolve('axios',{paths:[apiRoot]}));
      const requests=[];
      axios.defaults.adapter=async config=>{
        requests.push(new URL(config.url).pathname);
        const crypto=require(path.join(apiRoot,'util/crypto'));
        const payload=crypto.eapiReqDecrypt(new URLSearchParams(config.data).get('params'));
        assert.equal(payload.data.level,'hires');
        assert.equal(payload.data.ids,'[123]');
        return {status:200,statusText:'OK',headers:{},config,data:{code:200,data:[{
          id:123,url:'https://example.com/audio.flac',level:'hires',freeTrialInfo:null
        }]}};
      };
      (async()=>{
        const api=require('@neteasecloudmusicapienhanced/api');
        await assert.rejects(api.song_url_v1({id:'123',level:'hires'}),/xeapi public key is missing/);
        assert.equal(requests.length,0);
        const prepare=require(${JSON.stringify(adapter)}).prepareNeteaseRequestParams;
        const result=await api.song_url_v1(prepare('song/url/v1',{id:'123',level:'hires'},{}));
        assert.equal(result.status,200);
        assert.equal(result.body.data[0].level,'hires');
        assert.deepEqual(requests,['/eapi/song/enhance/player/url/v1']);
        assert.equal(fs.existsSync(path.join(${JSON.stringify(dir)},'xeapi_public_key')),false);
        console.log('embedded-audio-protocol-passed');
      })().catch(e=>{console.error(e);process.exitCode=1});
      `
    )
    expect(
      execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 })
    ).toContain('embedded-audio-protocol-passed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
