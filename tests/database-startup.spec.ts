import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

let directory: string, bundle: string

test.beforeAll(async () => {
  mkdirSync(resolve('tmp'), { recursive: true })
  directory = mkdtempSync(join(resolve('tmp'), 'db-startup-'))
  bundle = join(directory, 'db.cjs')
  await build({
    entryPoints: ['src/main/db.ts'],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    external: ['better-sqlite3'],
    plugins: [
      {
        name: 'isolated-database-environment',
        setup(builder) {
          builder.onResolve({ filter: /^(electron|\.\/log|\.\/utils\/Constants)$/ }, (args) => ({
            path: args.path,
            namespace: 'fixture'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents:
              args.path === 'electron'
                ? `export const app={getPath:()=>process.env.VUTRON_DB_FIXTURE_PROFILE}`
                : args.path === './log'
                  ? `export default {error(){},warn(){}}`
                  : `export default {IS_DEV_ENV:true,APP_VERSION:'4.0.0-beta.1'}`
          }))
        }
      }
    ]
  })
})

test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
})

const run = (mode: 'fresh' | 'legacy' | 'fallback' | 'rollback') => {
  const fixture = join(directory, mode)
  const profile = join(fixture, 'profile')
  mkdirSync(join(fixture, 'src/public'), { recursive: true })
  cpSync(resolve('src/public/migrations'), join(fixture, 'src/public/migrations'), {
    recursive: true
  })
  const result = spawnSync(
    require('electron'),
    [
      '-e',
      `
    const fs=require('node:fs'),path=require('node:path');
    const Database=require(${JSON.stringify(resolve('node_modules/better-sqlite3'))});
    const profile=${JSON.stringify(profile)},file=path.join(profile,'api_cache/db.sqlite');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const mode=${JSON.stringify(mode)};
    if(mode==='fallback')fs.mkdirSync(file);
    if(mode==='legacy'||mode==='rollback'){
      const seed=new Database(file);
      seed.exec(fs.readFileSync('src/public/migrations/init.sql','utf8'));
      seed.prepare('INSERT INTO AppData VALUES (?,?)').run('appVersion','1.4.0');
      seed.prepare('INSERT INTO Track (id,json,updatedAt) VALUES (?,?,?)').run(42,JSON.stringify({id:42,isLocal:true,name:'Retained song',picUrl:'/local-asset/pic?id=42'}),1234);
      seed.close();
    }
    if(mode==='rollback')fs.writeFileSync('src/public/migrations/2.5.0.sql',"UPDATE Track SET json='{}'; SELECT missing_fixture_column FROM Track;");
    let failure=false,db;
    try {db=require(${JSON.stringify(bundle)}).db;} catch {failure=true;}
    if(mode==='rollback'){
      const original=new Database(file);
      console.log(JSON.stringify({failure,columns:original.pragma('table_info(Track)').map(x=>x.name),row:original.prepare('SELECT * FROM Track WHERE id=42').get(),version:original.prepare('SELECT value FROM AppData WHERE id=?').get('appVersion').value}));original.close();
    }else{
      const result={persistent:db.persistent,columns:db.sqlite.pragma('table_info(Track)').map(x=>x.name),rows:db.findAll('Track'),version:db.find('AppData','appVersion').value};
      db.sqlite.close();
      if(mode==='legacy'){
        const backup=new Database(file+'.before-4.0.0-beta.1.bak');result.backupName=JSON.parse(backup.prepare('SELECT json FROM Track WHERE id=42').get().json).name;backup.close();
        delete require.cache[require.resolve(${JSON.stringify(bundle)})];
        const reopened=require(${JSON.stringify(bundle)}).db;result.reopened=reopened.persistent;result.reopenedRows=reopened.findAll('Track').length;reopened.sqlite.close();
      }
      console.log(JSON.stringify(result));
    }
  `
    ],
    {
      cwd: fixture,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VUTRON_DB_FIXTURE_PROFILE: profile },
      encoding: 'utf8',
      timeout: 15000
    }
  )
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!)
}

test('fresh persistent databases finish all migrations and expose the current track schema', () => {
  const state = run('fresh')
  expect(state.persistent).toBe(true)
  expect(state.columns).toContain('type')
  expect(state.rows).toEqual([])
  expect(state.version).toBe('4.0.0-beta.1')
})

test('legacy migration retains songs and backups and is safe to reopen', () => {
  const state = run('legacy')
  expect(state.persistent).toBe(true)
  expect(state.backupName).toBe('Retained song')
  expect(state.reopened).toBe(true)
  expect(state.reopenedRows).toBe(1)
  expect(state.rows[0].type).toBe('local')
  expect(JSON.parse(state.rows[0].json)).toMatchObject({
    name: 'Retained song',
    picUrl: 'atom://local-asset?type=pic?id=42'
  })
})

test('unavailable disk storage gets a compatible migrated in-memory schema', () => {
  const state = run('fallback')
  expect(state.persistent).toBe(false)
  expect(state.columns).toContain('type')
  expect(state.rows).toEqual([])
})

test('a failing migration rolls back earlier migrations without destroying the original songs', () => {
  const state = run('rollback')
  expect(state.failure).toBe(true)
  expect(state.columns).toContain('isLocal')
  expect(state.columns).not.toContain('type')
  expect(JSON.parse(state.row.json).name).toBe('Retained song')
  expect(state.version).toBe('1.4.0')
})
