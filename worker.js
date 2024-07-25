const path = require('path')
const fs = require('fs')
const simpleGit = require('simple-git');
const {exec} = require('child_process')
const scpClient = require('scp2');

// 获取当前目录
const currentDir = process.cwd()

const taskType = process.argv[2]; // 获取传递给子进程的任务标识参数
let taskTypeObj = JSON.parse(taskType)

const BASE_OBJ = {
  host: '192.168.1.207', // 服务器地址
  port: 80, // 端口
  username: 'admin', // 用户名
  password: '123456' // 密码
}

const PROJECR_OBJ = {
  test: {
    server_path: '/test/dist', // 服务器部署目录
    local_path: '/test', // 项目名
    branch: 'master', // 分支
    title: '测试'
  },
  test2: {
    server_path: '/test2/dist',
    local_path: '/test2',
    branch: 'dev',
    title: '测试2'
  },
  test3: {
    server_path: '/test3/dist',
    local_path: '/test3',
    branch: 'dev',
    title: '测试3'
  }
}
// 给每个目录设置对应的服务
Object.entries(PROJECR_OBJ).forEach(([k, v]) => {
  v.server = {
    ...BASE_OBJ,
    path: v.server_path
  }
})

// 向服务器上传代码
function scp(title, server) {
  scpClient.scp('./dist', server, (err) => {
    if (!err) {
      let msg = `**【${title}】__【测试环境】____发布成功**\n\n`
      fs.appendFile(getLogFileName(), msg, (err) => {
        if (!err) {
          process.send(`【${PROJECR_OBJ[taskTypeObj.key].title}】 发布成功`)
          process.exit(0)
        }
      })
    }
  })
}

// 获取存储日志的文件名
function getFileName() {
  return `build${taskTypeObj.index}.txt`
}

// 上传代码
async function uploadCode(pathName) {
  // 清空文件内容
  let fileName = path.join(currentDir, getFileName())
  fs.writeFileSync(fileName, '')

  // 获取当前项目的配置信息
  let obj = PROJECR_OBJ[pathName]
  let dir = cdDir(path.join(pathName, obj.local_path))
  await updateCode(dir, obj.branch)
  if (isUpdatePack()) { // 更新依赖
    fs.appendFileSync(getLogFileName(), '正在下载依赖包...\n')
    updatePack(() => startBuild(() => scp(obj.title, obj.server)))
  } else { // 未更新
    startBuild(() => scp(obj.title, obj.server))
  }
}

let pathName = taskTypeObj.key
uploadCode(pathName)

// 更新包依赖
function updatePack(fn) {
  const buildContext = exec('yarn')
  buildContext.stdout.on('data', data => {
    fs.appendFileSync(getLogFileName(), data)
  })
  buildContext.on('close', code => {
    if (code !== 0) {
      console.log(`打包失败，code：${code}`);
    } else {
      typeof fn === 'function' && fn()
    }
  })
}

// 是否有更新依赖
function isUpdatePack() {
  let fileData = fs.readFileSync('package.json')
  let fileData2 = fs.readFileSync('package_bak.json')

  // 删除备份文件
  fs.rmSync('package_bak.json')

  return Buffer.compare(fileData, fileData2) !== 0
}

// 更新仓库代码
async function updateCode (dirName, branch = 'dev') {
  // 获取git实例
  const git = simpleGit(dirName)
  fs.appendFileSync(getLogFileName(), `进入${branch}分支\n`)

  await git.fetch()
  let res = await git.branchLocal()
  if (res.all.includes(branch)) {
    await git.checkout(branch)
  } else {
    await git.checkout(['-b', branch, `origin/${branch}`])
  }

  fs.writeFileSync('package_bak.json', fs.readFileSync('package.json'))
  return await git.pull('origin', branch)
}

function cdDir(pathName) {
  let targetDir = path.join(currentDir, pathName)
  process.chdir(targetDir)
  fs.appendFileSync(getLogFileName(), `进入当前目录：${targetDir}\n`)
  return targetDir
}

function startBuild(fn) {
  // 开启服务打包用这个
  const buildContext = exec('yarn build')
  buildContext.stdout.on('data', data => {
    fs.appendFileSync(getLogFileName(), data)
  })
  buildContext.on('close', code => {
    if (code !== 0) {
      console.log(`打包失败，code：${code}`);
    } else {
      typeof fn === 'function' && fn()
    }
  })
}

function getLogFileName() {
  return path.join(currentDir, getFileName())
}