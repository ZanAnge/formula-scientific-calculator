import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';
let py;
before(async () => {
  py = await loadPyodide({ indexURL: fileURLToPath(new URL('../vendor/pyodide/', import.meta.url)) });
  py.FS.writeFile('/symbolic-python.zip', new Uint8Array(await readFile(new URL('../vendor/symbolic-python.zip', import.meta.url))));
  py.runPython('import sys, json\nsys.path.insert(0, "/symbolic-python.zip")\nfrom symbolic_solver import solve');
});
for (const [expression, expected] of [
  ['1/(s(s+1))', '1 - exp(-t)'],
  ['F（s）=1/（s（s+1））', '1 - exp(-t)'],
  ['(2s+5)/(s^2+5s+6)', 'exp(-2*t) + exp(-3*t)'],
  ['(s+3)/(s+1)^2', '2*t*exp(-t) + exp(-t)'],
  ['(2s+5)/(s^2+2s+5)', 'sin(2*t)'],
  ['(s^2+2s+3)/(s+1)', 'DiracDelta(t, 1)'],
  ['1/(s^2+1)^2', '-t*cos(t)/2 + sin(t)/2'],
  ['s/(s^2+9)', 'cos(3*t)'],
  ['1/(s^2-2)', 'sqrt(2)'],
  ['(s+2)/((s+1)^2*(s^2+4))', 'sin(2*t)'],
]) test('browser Python: ' + expression, () => {
  py.globals.set('expression_input', expression);
  const result = JSON.parse(py.runPython('json.dumps(solve(expression_input), ensure_ascii=False)'));
  assert.equal(result.verified, true);
  assert.equal(result.decomposition_verified, true);
  assert.ok(result.answer_text.includes(expected), result.answer_text);
});
test('browser Python rejects unsupported time shift', () => {
  py.globals.set('expression_input', 'exp(-s)/s');
  assert.throws(() => py.runPython('solve(expression_input)'));
});
