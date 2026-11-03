'use strict';
(() => {
  let worker, pending = null, sequence = 0;
  function stop() { if (worker) worker.terminate(); worker = null; }
  window.BrowserSolver = {
    solve(expression, onStatus) {
      if (pending) return Promise.reject(Error('正在计算，请稍候。'));
      if (!window.Worker || !window.WebAssembly) return Promise.reject(Error('此浏览器不支持本地计算引擎，请使用新版手机浏览器。'));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        let timer;
        function finish(error, data) {
          clearTimeout(timer); pending = null;
          if (error) { stop(); reject(error); } else resolve(data);
        }
        function deadline(ms, message) { clearTimeout(timer); timer = setTimeout(() => finish(Error(message)), ms); }
        try {
          worker ||= new Worker(new URL('symbolic-worker.mjs?v=mobile-keypad-2', document.baseURI), { type: 'module' });
          pending = { id };
          worker.onmessage = event => {
            const data = event.data;
            if (data.id && data.id !== id) return;
            if (data.stage) onStatus(data.message);
            if (data.stage === 'solving') deadline(20000, '求解超过20秒，任务已终止。请简化题目后重试。');
            if (data.error) finish(Error(data.error));
            else if (data.result) finish(null, data.result);
          };
          worker.onerror = event => finish(Error('计算引擎未能运行：' + (event.message || '浏览器无法加载模块工作线程，请使用新版系统浏览器。')));
          deadline(120000, '计算资源加载超时，请检查网络后重试。');
          worker.postMessage({ id, expression });
        } catch (error) { finish(error); }
      });
    }
  };
})();
