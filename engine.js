(function (root) {
  'use strict';
  const C = (re = 0, im = 0) => ({ re, im });
  const add = (a, b) => C(a.re + b.re, a.im + b.im);
  const neg = a => C(-a.re, -a.im);
  const sub = (a, b) => add(a, neg(b));
  const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const abs = a => Math.hypot(a.re, a.im);
  const div = (a, b) => {
    const scale = Math.max(Math.abs(b.re), Math.abs(b.im));
    if (!scale) throw Error('不能除以零，请检查分母。');
    const r = b.re / scale, i = b.im / scale, d = r * r + i * i;
    return C((a.re / scale * r + a.im / scale * i) / d, (a.im / scale * r - a.re / scale * i) / d);
  };
  const exp = a => C(Math.exp(a.re) * Math.cos(a.im), Math.exp(a.re) * Math.sin(a.im));
  const log = a => {
    if (!abs(a)) throw Error('对数的输入不能为零。');
    return C(Math.log(abs(a)), a.im === 0 && a.re < 0 ? Math.PI : Math.atan2(a.im, a.re));
  };
  const pow = (a, b) => {
    if (!abs(a)) {
      if (b.im || b.re <= 0) throw Error('零的该次幂没有定义。');
      return C();
    }
    if (!a.im && !b.im && (a.re >= 0 || Number.isInteger(b.re))) return C(Math.pow(a.re, b.re));
    const v = exp(mul(b, log(a)));
    // Remove only the roundoff introduced by polar conversion.
    const scale = abs(v);
    if (Math.abs(v.re) < scale * 1e-15) v.re = 0;
    if (Math.abs(v.im) < scale * 1e-15) v.im = 0;
    return v;
  };
  const real = a => { if (a.im) throw Error('此函数需要实数输入。'); return a.re; };
  function calculate(source, options = {}) {
    if (typeof source !== 'string' || source.length > 1000) throw Error('表达式过长，最多输入 1000 个字符。');
    const input = source.replace(/（/g, '(').replace(/）/g, ')').replace(/×/g, '*').replace(/[÷]/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    const tokens = []; let p = 0;
    while (p < input.length) {
      if (/\s/.test(input[p])) { p++; continue; }
      const rest = input.slice(p);
      const number = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      const name = rest.match(/^[a-zA-Z]+/);
      if (number) {
        if (tokens.length && tokens[tokens.length - 1].type === 'number') throw Error('数字格式不正确，请检查小数点或缺失的运算符。');
        tokens.push({ type: 'number', value: Number(number[0]) }); p += number[0].length;
      }
      else if (name) { tokens.push({ type: 'name', value: name[0].toLowerCase() }); p += name[0].length; }
      else if ('+-*/^()!%°'.includes(input[p])) tokens.push({ type: input[p++] });
      else throw Error('无法识别字符「' + input[p] + '」，请检查输入。');
    }
    if (!tokens.length) throw Error('请先输入一个表达式。');
    tokens.push({ type: 'end' }); let cursor = 0, depth = 0;
    const peek = () => tokens[cursor].type;
    const take = () => tokens[cursor++];
    const radians = options.angle === 'RAD';
    function fn(name, a) {
      if (name === 'sqrt') return pow(a, C(.5));
      if (name === 'ln') return log(a);
      if (name === 'log') return div(log(a), C(Math.LN10));
      if (name === 'exp') return exp(a);
      const x = real(a), angle = radians ? x : (x % 360) * Math.PI / 180;
      if (['sin', 'cos', 'tan'].includes(name)) {
        const turns = radians ? x / (Math.PI / 2) : x / 90;
        const quadrant = Number.isInteger(turns) ? ((turns % 4) + 4) % 4 : null;
        if (name === 'sin') return C(quadrant === null ? Math.sin(angle) : [0, 1, 0, -1][quadrant]);
        if (name === 'cos') return C(quadrant === null ? Math.cos(angle) : [1, 0, -1, 0][quadrant]);
        if (quadrant === 1 || quadrant === 3) throw Error('该角度的正切没有定义。');
        return C(quadrant === null ? Math.tan(angle) : 0);
      }
      if (['asin', 'acos', 'atan'].includes(name)) {
        if (name !== 'atan' && Math.abs(x) > 1) throw Error('反正弦和反余弦的输入范围为 -1 到 1。');
        return C(Math[name](x) * (radians ? 1 : 180 / Math.PI));
      }
      throw Error('不支持函数「' + name + '」。');
    }
    function expression(min = 0) {
      if (++depth > 100) throw Error('括号或运算嵌套太深，请简化表达式。');
      let a; const t = take();
      if (t.type === 'number') a = C(t.value);
      else if (t.type === '+' || t.type === '-') { a = expression(25); if (t.type === '-') a = neg(a); }
      else if (t.type === '(') { a = expression(); if (peek() !== ')') throw Error('缺少右括号 )。'); take(); }
      else if (t.type === 'name') {
        const constants = { pi: C(Math.PI), e: C(Math.E), j: C(0, 1), ans: options.ans || C() };
        if (Object.hasOwn(constants, t.value)) a = constants[t.value];
        else {
          if (peek() !== '(') {
            if (t.value !== 'sqrt') throw Error('函数后需要括号，例如 sin(30)。');
            a = fn(t.value, expression(25));
          } else {
            take(); const arg = expression();
            if (peek() !== ')') throw Error('函数缺少右括号 )。');
            take(); a = fn(t.value, arg);
          }
        }
      } else throw Error('表达式不完整，请检查数字、运算符和括号。');
      while (true) {
        const op = peek();
        if (['!', '%', '°'].includes(op)) {
          if (40 < min) break; take();
          if (op === '%') a = div(a, C(100));
          else if (op === '°') a = radians ? mul(a, C(Math.PI / 180)) : a;
          else {
            const n = real(a);
            if (!Number.isInteger(n) || n < 0 || n > 170) throw Error('阶乘仅支持 0 到 170 的整数。');
            let v = 1; for (let i = 2; i <= n; i++) v *= i; a = C(v);
          }
          continue;
        }
        const implicit = ['number', 'name', '('].includes(op);
        const precedence = op === '+' || op === '-' ? 10 : op === '*' || op === '/' || implicit ? 20 : op === '^' ? 30 : -1;
        if (precedence < min) break;
        if (!implicit) take();
        const b = expression(precedence + (op === '^' ? 0 : 1));
        a = implicit || op === '*' ? mul(a, b) : op === '+' ? add(a, b) : op === '-' ? sub(a, b) : op === '/' ? div(a, b) : pow(a, b);
      }
      depth--; return a;
    }
    const result = expression();
    if (peek() !== 'end') throw Error('括号不匹配或表达式有多余内容。');
    if (!Number.isFinite(result.re) || !Number.isFinite(result.im)) throw Error('结果超出可计算范围，请减小数值。');
    if (!options.complex && result.im) throw Error('结果含虚数，请切换到复数计算模式。');
    return result;
  }
  const formatNumber = x => Object.is(x, -0) || x === 0 ? '0' : Number(x.toPrecision(12)).toString();
  function format(a) {
    if (!a.im) return formatNumber(a.re);
    const part = Math.abs(a.im) === 1 ? 'j' : formatNumber(Math.abs(a.im)) + 'j';
    return (a.re ? formatNumber(a.re) + (a.im < 0 ? ' − ' : ' + ') : a.im < 0 ? '−' : '') + part;
  }
  function polar(a, angle = 'DEG') {
    const magnitude = abs(a);
    const phase = magnitude ? Math.atan2(a.im, a.re) * (angle === 'RAD' ? 1 : 180 / Math.PI) : null;
    return { magnitude, phase };
  }
  function solve(kind, values) {
    if (!values.every(Number.isFinite)) throw Error('请填写所有系数，且必须是有限实数。');
    if (kind === 'linear') {
      const [a, b] = values;
      if (!a) return { message: b ? '无解' : '无穷多解', roots: [] };
      return { roots: [['x', C(-b / a)]] };
    }
    if (kind === 'quadratic') {
      let [a, b, c] = values;
      if (!a) return solve('linear', [b, c]);
      const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c)); a /= scale; b /= scale; c /= scale;
      const d = b * b - 4 * a * c;
      if (d < 0) return { roots: [['x₁', C(-b / (2 * a), Math.sqrt(-d) / (2 * a))], ['x₂', C(-b / (2 * a), -Math.sqrt(-d) / (2 * a))]] };
      const q = -.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(d));
      return { roots: [['x₁', C(q / a)], ['x₂', C(q ? c / q : -b / (2 * a))]] };
    }
    const [a, b, c, d, e, f] = values;
    const scale = Math.max(...values.map(Math.abs));
    if (!scale) return { message: '无穷多解', roots: [] };
    const [A, B, R, D, E, S] = values.map(v => v / scale);
    const det = A * E - B * D;
    if (!det) {
      const inconsistent = (!a && !b && c !== 0) || (!d && !e && f !== 0) || A * S !== R * D || B * S !== R * E;
      return { message: inconsistent ? '无解' : '无穷多解', roots: [] };
    }
    return { roots: [['x', C((R * E - B * S) / det)], ['y', C((A * S - R * D) / det)]] };
  }
  const api = { calculate, format, formatNumber, polar, solve, C };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalcEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
