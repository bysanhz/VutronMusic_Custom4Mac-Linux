import { expect, test } from '@playwright/test'
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import { Agent } from 'node:https'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import axios from 'axios'
import {
  getNeteaseDirectFamily,
  installNeteaseNetworkFamily
} from '../src/main/appServer/neteaseNetworkFamily'

const address = (family: string, value: string, internal = false) =>
  ({ family, address: value, internal }) as NetworkInterfaceInfo

test('selects configured families without treating loopback or link-local as public connectivity', () => {
  const v4 = address('IPv4', '192.168.1.2')
  const v6 = address('IPv6', '2001:db8::1')
  const local = [address('IPv6', 'fe80::1'), address('IPv6', '::1', true)]
  expect(getNeteaseDirectFamily({ eth: [v4, ...local] })).toBe(4)
  expect(getNeteaseDirectFamily({ eth: [v6] })).toBe(6)
  expect(getNeteaseDirectFamily({ eth: [v4, v6] })).toBeUndefined()
  expect(getNeteaseDirectFamily({ eth: local })).toBeUndefined()
  expect(getNeteaseDirectFamily({ eth: [address('IPv4', '169.254.1.2')] })).toBeUndefined()
  expect(getNeteaseDirectFamily({})).toBeUndefined()
})

test('preserves proxies, explicit policies and other clients; removing the interceptor restores defaults', async () => {
  const seen: any[] = []
  const client = axios.create({
    adapter: async (config) => {
      seen.push(config)
      return { config, status: 200, statusText: 'OK', headers: {}, data: { code: 200 } }
    }
  })
  const remove = installNeteaseNetworkFamily(client)
  const direct = {
    url: 'https://interfacepc.music.163.com/eapi/content/activity/listen/data/realtime/report',
    proxy: false as const,
    httpsAgent: new Agent({ keepAlive: true })
  }
  try {
    await client.request(direct)
    expect(seen.at(-1).family).toBe(getNeteaseDirectFamily(networkInterfaces()))
    expect(seen.at(-1).timeout).toBe(15_000)
    for (const override of [
      { proxy: { host: '127.0.0.1', port: 7890 } },
      { proxy: undefined },
      { httpsAgent: { proxyOptions: { host: '127.0.0.1' } } },
      { url: 'https://example.com/' },
      { url: 'https://interfacepc.music.163.com.example.com/' },
      { lookup: (() => {}) as any }
    ]) {
      await client.request({ ...direct, ...override })
      expect(seen.at(-1).family).toBeUndefined()
    }
    await client.request({ ...direct, family: 6 })
    expect(seen.at(-1).family).toBe(6)
    await client.request({ ...direct, timeout: 5000 })
    expect(seen.at(-1).timeout).toBe(5000)
    remove()
    await client.request(direct)
    expect(seen.at(-1).family).toBeUndefined()
  } finally {
    remove()
    direct.httpsAgent.destroy()
  }
})

test('embedded API applies the policy to its real transport, rechecks interfaces and propagates failure', async () => {
  const dir = mkdtempSync(resolve('tmp/netease-network-family-'))
  try {
    const policy = join(dir, 'policy.cjs')
    await build({
      entryPoints: ['src/main/appServer/neteaseNetworkFamily.ts'],
      outfile: policy,
      platform: 'node',
      bundle: true
    })
    const script = join(dir, 'probe.cjs')
    writeFileSync(
      script,
      `
      const assert=require('node:assert/strict'),os=require('node:os'),dns=require('node:dns');
      const ipv4={family:'IPv4',address:'192.168.1.2',internal:false};
      const ipv6={family:'IPv6',address:'2001:db8::1',internal:false};
      let interfaces={eth:[ipv4,{family:'IPv6',address:'fe80::1',internal:false}]};
      os.networkInterfaces=()=>interfaces;
      const axios=require(require.resolve('axios',{paths:[require.resolve('@neteasecloudmusicapienhanced/api')]}));
      const seen=[];let fail=false;
      const ipv4Answer={address:'127.0.0.2',family:4},ipv6Answer={address:'::1',family:6};
      let dnsAnswers=[ipv6Answer,ipv4Answer];
      const originalLookup=dns.lookup;
      dns.lookup=(host,options,cb)=>{
        if(host!=='interfacepc.music.163.com')return originalLookup(host,options,cb);
        assert.equal(options.order,'ipv4first');
        const addresses=dnsAnswers.slice().sort((a,b)=>a.family-b.family);
        if(options.all)cb(null,addresses);else cb(null,addresses[0].address,addresses[0].family);
      };
      axios.defaults.adapter=async config=>{
        seen.push({family:config.family,timeout:config.timeout,lookup:config.lookup,host:new URL(config.url).hostname});
        if(fail)throw Object.assign(Error('connect ETIMEDOUT'),{code:'ETIMEDOUT'});
        return {config,status:200,statusText:'OK',headers:{},data:{code:200,data:{}}};
      };
      const remove=require(${JSON.stringify(policy)}).installNeteaseNetworkFamily(axios);
      const api=require('@neteasecloudmusicapienhanced/api');
      (async()=>{
        for(const name of ['listen_data_realtime_report','listen_data_today_song','listen_data_total']){
          await api[name]({type:'month',cookie:{}});
          assert.equal(seen.at(-1).family,4);
          assert.equal(seen.at(-1).timeout,15000);
        }
        interfaces={eth:[ipv4,ipv6]};
        await api.listen_data_total({cookie:{}});assert.equal(seen.at(-1).family,undefined);
        const dualLookup=seen.at(-1).lookup;
        assert.equal(typeof dualLookup,'function');
        const resolveAll=()=>new Promise((resolve,reject)=>dualLookup('interfacepc.music.163.com',{all:true},(err,result)=>err?reject(err):resolve(result)));
        assert.deepEqual(await resolveAll(),[ipv4Answer,ipv6Answer]);
        dnsAnswers=[ipv6Answer];assert.deepEqual(await resolveAll(),[ipv6Answer]);
        dnsAnswers=[ipv6Answer,ipv4Answer];
        // Exercise Node's real fallback: IPv4 is refused, IPv6 remains usable.
        const net=require('node:net'),server=net.createServer(socket=>socket.end());
        await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'::1',resolve));
        try{
          await new Promise((resolve,reject)=>{
            const socket=net.connect({host:'interfacepc.music.163.com',port:server.address().port,lookup:dualLookup});
            socket.setTimeout(3000,()=>socket.destroy(Error('fallback timeout')));
            socket.once('error',reject);
            socket.once('connect',()=>{assert.equal(socket.remoteFamily,'IPv6');socket.destroy();resolve()});
          });
        }finally{await new Promise(resolve=>server.close(resolve))}
        interfaces={eth:[ipv6]};
        await api.listen_data_total({cookie:{}});assert.equal(seen.at(-1).family,6);
        await api.listen_data_total({cookie:{},timeout:5000});assert.equal(seen.at(-1).timeout,5000);
        fail=true;const before=seen.length;
        await assert.rejects(api.listen_data_total({cookie:{}}),e=>e.status===502&&e.body.msg.includes('ETIMEDOUT'));
        assert.equal(seen.length,before+1); // No automatic retries or fabricated success.
        remove();console.log('embedded-network-family-passed');
      })().catch(e=>{console.error(e);process.exitCode=1});
      `
    )
    expect(
      execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 })
    ).toContain('embedded-network-family-passed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
