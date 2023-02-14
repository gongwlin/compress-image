#!/usr/bin/env node

const fs = require("fs");
const commander = require("commander");
const { simpleGit } = require("simple-git");
const child_process = require("child_process");
const { program } = require("commander");
const path = require('path');
const https = require('https');
const { URL } = require('url');

const config = program
	.option("-dir, --dir <name>", "entry point", "src/assets/")
	.option("-type, --type <type>", "part or all", "part")
	.option("-deep, --deep <boolean>", "output extra debugging")
  .parse()
  .opts();
  

const cwd = process.cwd();

const exts = ['.jpg', '.png', 'jpeg'];

const max = 5200000; // 5MB == 5242848.754299136


const options = {
  method: 'POST',
  hostname: 'tinypng.com',
  path: '/web/shrink',
  headers: {
    rejectUnauthorized: false,
    'Postman-Token': Date.now(),
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': getRandomUA()
  }
};

getStatus();

async function getStatus() {
	try {
		if (config.type === "part") {
			const isGitRepo = child_process.execSync(
				"git rev-parse --is-inside-work-tree",
				{ encoding: "utf8" }
			);
			if (!isGitRepo) {
				throw Error("type为增量时，应配合在git仓库下使用");
			}
      const git = simpleGit();
      const wholeRepoStatus = await git.status();
      console.log("list", wholeRepoStatus.not_added);

      const fileList = wholeRepoStatus.not_added.filter(v => {
        const reg = new RegExp(config.dir, 'i');
        return reg.test(v);
      });
      filePathList(fileList)
      return
		}

    fileList(path.join(cwd, config.dir))

	} catch (e) {
		console.log("请安装git工具");
	}
}

// 生成随机IP， 赋值给 X-Forwarded-For
function getRandomIP() {
  return Array.from(Array(4)).map(() => Math.ceil(Math.random() * 255)).join('.')
}

// 生成随机UA
function getRandomUA () {
  const UAList = [
    'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; 360SE)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.56 Safari/535.11',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.1; rv,2.0.1) Gecko/20100101 Firefox/4.0.1',
    'Opera/9.80 (Windows NT 6.1; U; en) Presto/2.8.131 Version/11.11',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
  ];
  const len = UAList.length;
  return Math.floor(Math.random() * len)
}

// 获取文件列表
function fileList(folder) {

  fs.readdir(folder, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return
    }

    files.forEach((file) => {
      if (file.isDirectory()) {
        fileList(path.join(folder, file.name))
      }

      if (file.isFile()) {
        fileFilter(path.join(folder, file.name));
      }
    })
  })
}

// 获取文件列表
function filePathList(filePath) {
  filePath.forEach((file) => {
    fileFilter(path.join(cwd, file))
  })
}


// 过滤文件格式，返回所有jpg,png图片
function fileFilter(file) {
  fs.stat(file, (err, stats) => {
    if (err) return console.error(err);
    if (
      // 必须是文件，小于5MB，后缀 jpg||png
      stats.size <= max &&
      stats.isFile() &&
      exts.includes(path.extname(file))
    ) {
      // 通过 X-Forwarded-For 头部伪造客户端IP
      options.headers['X-Forwarded-For'] = getRandomIP();
      fileUpload(file);
    }
  });
}

// 上传压缩图片
function fileUpload(img) {
  var req = https.request(options, function(res) {
    res.on('data', buf => {
      let obj = JSON.parse(buf.toString());
      if (obj.error) {
        console.log(`[${img}]：压缩失败！报错：${obj.message}`);
      } else {
        fileUpdate(img, obj);
      }
    });
  });

  req.write(fs.readFileSync(img), 'binary');

  req.on('error', e => {
    console.error(e);
  });

  req.end();
}

// 下载压缩图片
function fileUpdate(imgpath, obj) {
  let options = new URL(obj.output.url);
  let req = https.request(options, res => {
    let body = '';
    res.setEncoding('binary');
    res.on('data', function(data) {
      body += data;
    });

    res.on('end', function() {
      fs.writeFile(imgpath, body, 'binary', err => {
        if (err) return console.error(err);

        const { input, output } = obj;
        const inputSize = input.size;
        const outputSize = output.size;

        console.log(
          `${imgpath} \n 压缩成功，原始大小: ${Math.ceil(inputSize / 1024)}K，压缩后大小: ${
            Math.ceil(outputSize / 1024)
          }K，优化比例: ${((inputSize - outputSize) / inputSize * 100).toFixed(1)}%\n`
        );
      });
    });
  });

  req.on('error', e => {
    console.error(e);
  });
  
  req.end();
}
