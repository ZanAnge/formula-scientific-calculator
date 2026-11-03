'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const value = (s, options) => E.calculate(s, options);
const cases = [
  ['2+3×4', 14], ['(2+3)×4', 20], ['（2+3）×4', 20], ['sin(30)', .5], ['sin(30°)', .5], ['√(144)', 12], ['√144', 12], ['sqrt(144)', 12], ['5!', 120],
  ['0.1+0.2', .3], ['1/3+1/6', .5], ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['2^-2', .25], ['(2+3)(4-1)', 15],
  ['2π', 2 * Math.PI], ['3(2+1)', 9], ['50%', .5], ['200×10%', 20], ['100+10%', 100.1], ['0!', 1],
  ['log(100)', 2], ['ln(e)', 1], ['exp(1)', Math.E], ['cos(60)', .5], ['tan(45)', 1], ['asin(0.5)', 30], ['acos(0.5)', 60], ['atan(1)', 45], ['1e-3+2E3', 2000.001], ['sin(180)', 0]
];
for (const [expression, expected] of cases) test(expression, () => close(value(expression).re, expected));
test('RAD and explicit degree suffix', () => { close(value('sin(pi/2)', { angle: 'RAD' }).re, 1); close(value('sin(30°)', { angle: 'RAD' }).re, .5); close(value('asin(1)', { angle: 'RAD' }).re, Math.PI / 2); });
test('floating point display', () => { assert.equal(E.format(value('0.1+0.2')), '0.3'); assert.equal(E.formatNumber(1e-20), '1e-20'); });
test('Ans', () => close(value('Ans*2', { ans: E.C(7) }).re, 14));
test('tiny trigonometric inputs retain their magnitude', () => {
  assert.ok(value('sin(1e-20)', { angle: 'RAD' }).re > 0);
  assert.equal(E.format(value('sin(1e-20)', { angle: 'RAD' })), '1e-20');
  assert.ok(Number.isFinite(value('tan(89.9999999999999)').re));
});
test('complex arithmetic and implicit j', () => {
  const options = { complex: true };
  assert.deepEqual(value('(3+4j)×(1+2j)', options), E.C(-5, 10));
  assert.deepEqual(value('(3+4j)+(1-2j)', options), E.C(4, 2));
  assert.deepEqual(value('(3+4j)-(1-2j)', options), E.C(2, 6));
  const z = value('(3+4j)/(1+2j)', options); close(z.re, 2.2); close(z.im, -.4);
  const p = E.polar(value('3+4j', options)); close(p.magnitude, 5); close(p.phase, 53.130102354156);
  close(E.polar(E.C(3, 4), 'RAD').phase, Math.atan2(4, 3));
  assert.equal(E.polar(E.C()).phase, null);
  assert.equal(E.format(value('sqrt(-1)', options)), 'j');
  close(value('j^2', options).re, -1);
});
test('quadratic, complex roots, degeneration and stable roots', () => {
  const roots = E.solve('quadratic', [1, -5, 6]).roots.map(x => x[1].re).sort(); close(roots[0], 2); close(roots[1], 3);
  assert.equal(E.solve('quadratic', [1, 0, 1]).roots[0][1].im, 1);
  assert.equal(E.solve('quadratic', [0, 2, -6]).roots[0][1].re, 3);
  close(E.solve('quadratic', [1, 0, 0]).roots[0][1].re, 0);
  const stable = E.solve('quadratic', [1, 1e8, 1]).roots; close(stable[1][1].re, -1e-8);
});
test('linear equations and systems', () => {
  assert.equal(E.solve('linear', [2, -6]).roots[0][1].re, 3);
  assert.equal(E.solve('linear', [0, 1]).message, '无解'); assert.equal(E.solve('linear', [0, 0]).message, '无穷多解');
  assert.deepEqual(E.solve('system', [1, 1, 3, 1, -1, 1]).roots.map(x => x[1].re), [2, 1]);
  assert.equal(E.solve('system', [1, 1, 2, 2, 2, 4]).message, '无穷多解');
  assert.equal(E.solve('system', [1, 1, 2, 2, 2, 5]).message, '无解');
  assert.equal(E.solve('system', [0, 0, 1, 0, 0, 2]).message, '无解');
});
for (const s of ['', '1/0', '(', '2+', 'sin(', 'foo(2)', '(-1)!', '171!', '1.5!', 'tan(90)', 'asin(2)', 'ln(0)', 'sqrt(-1)', '1..2', '1e999', '<script>', 'constructor(1)', '2**3', '2)']) {
  test('reject invalid: ' + s, () => assert.throws(() => value(s)));
}
test('resource bounds', () => { assert.throws(() => value('1'.repeat(1001))); assert.throws(() => value('('.repeat(110) + '1' + ')'.repeat(110))); });
