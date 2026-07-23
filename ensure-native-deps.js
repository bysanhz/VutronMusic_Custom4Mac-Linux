const childProcess = require('child_process')
const path = require('path')

const projectRoot = __dirname
const electronPath = require('electron')

const validationCode = `
const Database = require('better-sqlite3')
const database = new Database(':memory:')
database.prepare('SELECT 1').get()
database.close()
`

const validateBetterSqlite3 = () => {
  return childProcess.spawnSync(electronPath, ['-e', validationCode], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    },
    encoding: 'utf8'
  })
}

const printFailureOutput = (result) => {
  if (result.stdout?.trim()) console.error(result.stdout.trim())
  if (result.stderr?.trim()) console.error(result.stderr.trim())
  if (result.error) console.error(result.error)
}

const initialCheck = validateBetterSqlite3()
if (initialCheck.status === 0) {
  console.log('[native-deps] better-sqlite3 与当前 Electron ABI 匹配')
  process.exit(0)
}

console.warn(
  '[native-deps] better-sqlite3 缺失或 ABI 不匹配，开始自动重建'
)
printFailureOutput(initialCheck)

const rebuildScript = path.join(projectRoot, 'rebuild.js')
const rebuildResult = childProcess.spawnSync(
  process.execPath,
  [rebuildScript],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
  }
)

if (rebuildResult.status !== 0) {
  console.error('[native-deps] Electron 原生依赖重建失败')
  process.exit(rebuildResult.status || 1)
}

const finalCheck = validateBetterSqlite3()
if (finalCheck.status !== 0) {
  console.error('[native-deps] 重建完成后 better-sqlite3 仍无法加载')
  printFailureOutput(finalCheck)
  process.exit(finalCheck.status || 1)
}

console.log('[native-deps] better-sqlite3 自动重建并验证成功')
