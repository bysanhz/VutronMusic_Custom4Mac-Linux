import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

test('saved quit preference never starts a timer; only explicit activation can quit', async () => {
  const directory = mkdtempSync(resolve('tmp/sleep-timer-runtime-'))
  try {
    const bundle = join(directory, 'timer.cjs')
    await build({
      entryPoints: ['src/renderer/utils/sleepTimerSettings.ts'],
      outfile: bundle,
      bundle: true,
      platform: 'node'
    })
    const script = join(directory, 'probe.cjs')
    writeFileSync(
      script,
      `
      const assert=require('node:assert/strict');
      let now=0,next=1,paused=0,quit=0;const timers=new Map();
      Date.now=()=>now;
      global.localStorage={getItem:()=>JSON.stringify({action:'quit',fadeSeconds:0}),setItem:()=>{}};
      global.window={vutronmusic:{currentTrack:{id:1}},addEventListener:()=>{},
        setTimeout:(fn,ms)=>{const id=next++;timers.set(id,{fn,at:now+ms});return id},
        clearTimeout:id=>timers.delete(id),setInterval:()=>next++,clearInterval:()=>{}};
      const timer=require(${JSON.stringify(bundle)});
      timer.registerSleepTimerRuntimeHandlers({pause:()=>{paused++},quit:()=>{quit++}});
      const advance=async ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn()}await new Promise(setImmediate)};
      (async()=>{
        assert.equal(timer.sleepTimerAction.value,'quit');
        assert.equal(timer.sleepTimerMode.value,'off');assert.equal(timers.size,0);
        await advance(24*60*60*1000);
        assert.equal(timer.consumeSleepTimerAtTrackEnd(1),false);
        assert.equal(await timer.completeSleepTimerAtQueueEnd(),false);
        assert.equal(paused,0);assert.equal(quit,0);
        timer.startSleepTimer(1);timer.cancelSleepTimer();await advance(24*60*60*1000);
        assert.equal(quit,0);assert.equal(paused,0);
        assert.equal(timer.startSleepTimer(1),true);await advance(60000);
        assert.equal(paused,1);assert.equal(quit,1);assert.equal(timer.sleepTimerMode.value,'off');
        console.log('sleep-timer-explicit-activation-passed');
      })().catch(e=>{console.error(e);process.exitCode=1});
    `
    )
    expect(
      execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 })
    ).toContain('sleep-timer-explicit-activation-passed')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
