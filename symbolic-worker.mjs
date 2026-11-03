import { loadPyodide } from './vendor/pyodide/pyodide.mjs';

let ready;
async function initialize() {
  self.postMessage({ stage: 'loading', message: '首次加载本地计算引擎，约18 MB，请稍候…' });
  const py = await loadPyodide({ indexURL: new URL('./vendor/pyodide/', self.location.href).href });
  const response = await fetch(new URL('./vendor/symbolic-python.zip?v=20261103-keypad', self.location.href));
  if (!response.ok) throw Error('数学资源下载失败，请检查网络后重试。');
  py.FS.writeFile('/symbolic-python.zip', new Uint8Array(await response.arrayBuffer()));
  await py.runPythonAsync('import sys\nsys.path.insert(0, "/symbolic-python.zip")\nimport json\nfrom symbolic_solver import solve\nfrom math_parser import InputError');
  return py;
}
self.onmessage = async event => {
  const { id, expression } = event.data;
  try {
    ready ||= initialize();
    const py = await ready;
    self.postMessage({ id, stage: 'solving', message: '正在手机本地推导并精确验证…' });
    // User input is a Python value; only this fixed, trusted program is executed.
    py.globals.set('request_expression', expression);
    const json = await py.runPythonAsync(`
try:
    response = dict(ok=True, **solve(request_expression))
except (InputError, ArithmeticError) as error:
    response = dict(ok=False, error=str(error))
except Exception:
    response = dict(ok=False, error='当前表达式未能求解，请检查输入或简化题目。')
json.dumps(response, ensure_ascii=False)
`);
    self.postMessage({ id, result: JSON.parse(json) });
  } catch (error) {
    ready = null;
    self.postMessage({ id, error: '计算引擎加载失败：' + error.message });
  }
};
