'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.env.PYTHON || 'python', ['-u', path.join(__dirname, 'server.py')], { cwd: __dirname, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error('无法启动 Python。请安装 Python 3.10+，再安装 requirements.txt 中的依赖。', error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill());
