const http = require('http')
const path = require('path')
const fs = require('fs')
const simpleGit = require('simple-git');
const {exec} = require('child_process')
const url = require('url')
const { fork } = require('child_process');

// 获取当前目录
const currentDir = process.cwd()

http.createServer(async (req, res) => {
  // 设置跨域
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-headers', 'Content-Type')
  res.setHeader('Content-Type', 'Application/json')

  let urlObj = url.parse(req.url, true)
  let pathname = urlObj.pathname
  if (pathname === '/') {
    pathname = '/build.html'
  }
  let extname = path.extname(pathname)

  // 使用Promise封装子进程执行的函数
  function runChildProcess(workerPath, args) {
    return new Promise((resolve, reject) => {
      const childProcess = fork(workerPath, [
        JSON.stringify({
          index: args.idx,
          key: args.key
        })
      ])

      // 监听子进程的消息
      childProcess.on('message', (msg) => {
        console.log(`子进程 ${args.idx} ：`, msg);
      })

      childProcess.on('exit', code => {
        if (code == 0) {
          resolve()
        } else {
          reject(new Error(`子进程 ${workerPath} 退出码为 ${code}`))
        }
      })
    })
  }
  // 创建多个子进程执行任务
  async function runTasks() {
    const workerPath = './worker.js'

    // 获取当前选中的所有环境
    let names = urlObj.query.names
    names = JSON.parse(names)

    const promises = names.map((val, idx) => runChildProcess(workerPath, {
      key: val,
      idx: idx+1
    }))

    try {
      await Promise.all(promises)
      console.log('All finished！');
      res.end()
    } catch(err) {
      console.error('子进程执行出错：', err)
    }
  }

  if (pathname !== '/favicon.ico') {
    let originPath = pathname.slice(1)
    
    if (originPath === 'release') {
      runTasks()
    } else if (originPath == 'init') {
      let query = urlObj.query

      if (isExist(query.dir)) { // 存在目录，直接返回
        res.end()
      } else {
        // 1、创建目录
        fs.mkdirSync(query.dir)
        // 2、进入目录
        let targetDir = cdDir(query.dir)
        // 3、初始化git项目
        let gitInstance = await initGitProject(targetDir, query.git)
        // 4、进入git项目目录
        targetDir = cdDir(getFileName(query.git))

        // 5、安装依赖
        const buildContext = exec('yarn')
        buildContext.stdout.on('data', console.log)
        buildContext.on('close', code => {
          if (code == 0) {
            gitInstance.clean('f')
            process.chdir(currentDir)
            res.end('项目初始化成功')
          }
        })
      }
    } else {
      let fileName = path.join(currentDir, pathname)
      fs.readFile(fileName, (err, data) => {
        if (err) {
          res.writeHead(200, {
            'Content-Type': 'text/html;charset=utf-8'
          })
          res.write('404')
        } else {
          res.writeHead(200, {
            'Content-Type': `${getExt(extname)};chartset=utf-8`
          })
          res.write(data)
        }
        res.end()
      })
    }
  }
}).listen(80)


const initGitProject = async (dirName, git) => {
  // 克隆项目
  const gitInstance = simpleGit(dirName)
  await gitInstance.clone(git)
  return gitInstance
}

function cdDir(pathName) {
  let targetDir = path.join(process.cwd(), pathName)
  process.chdir(targetDir)
  return targetDir
}

// 根据git地址，获取项目名称
const getFileName = (url) => {
  return url.match(/\/([^\/]+)\.git$/)[1]
}

// 判断是否存在目录
const isExist = (dir) => {
  try {
    const stats = fs.statSync(dir);
    // 如果 stats 是一个目录，则返回 true，否则返回 false
    return stats.isDirectory()
  } catch (error) {
    return false
  }
}

const getExt = (val) => {
  if (val === '.html') {
    return 'text/html'
  } else if (val === '.css') {
    return 'text/css'
  } else if (val === '.js') {
    return 'application/x-javascript'
  } else {
    return null
  }
}