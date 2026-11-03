'use strict';
(() => {
  const E = CalcEngine, $ = id => document.getElementById(id);
  const input = $('expression');
  let mode = 'normal', angle = 'DEG', shifted = false, completed = false;
  let ans = E.C(), lastResult = E.C(), resultValid = true, history = [], toastTimer;
  const storageKey = 'formula.history.v1';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) history = saved.filter(x => x && typeof x.expression === 'string' && x.expression.length <= 1000 && typeof x.result === 'string' && ['normal', 'complex', 'equation'].includes(x.mode) && ['DEG', 'RAD'].includes(x.angle) && Number.isFinite(x.time)).slice(0, 50);
  } catch { toast('历史记录暂时不可用，本次仍可正常计算。'); }
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500);
  }
  function saveHistory() {
    try { localStorage.setItem(storageKey, JSON.stringify(history)); }
    catch { toast('浏览器未允许保存历史，本次记录仅保存在内存。'); }
    renderHistory();
  }
  function pushHistory(entry) {
    history.unshift({ ...entry, angle, time: Date.now() }); history = history.slice(0, 50); saveHistory();
  }
  function renderHistory() {
    $('history-count').textContent = String(history.length).padStart(2, '0');
    $('history-indicator').textContent = history.length + ' 条记录';
    const list = $('history-list'); list.replaceChildren();
    if (!history.length) {
      const box = document.createElement('div'); box.className = 'history-empty';
      box.innerHTML = '<span class="empty-symbol">◷</span><p>思考的轨迹，从这里开始。<br>完成计算后，记录会自动出现在这里。</p>';
      list.append(box); return;
    }
    history.forEach(entry => {
      const button = document.createElement('button'); button.className = 'history-item';
      const meta = document.createElement('div'); meta.className = 'history-meta';
      const label = document.createElement('span'); label.textContent = ({ normal: '普通计算', complex: '复数计算', equation: '方程求解' })[entry.mode] + ' · ' + entry.angle;
      const time = document.createElement('span'); time.textContent = new Date(entry.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      meta.append(label, time);
      const expression = document.createElement('div'); expression.className = 'history-expression'; expression.textContent = entry.expression;
      const result = document.createElement('div'); result.className = 'history-value'; result.textContent = '= ' + entry.result;
      button.append(meta, expression, result);
      button.title = '重新使用此计算';
      button.addEventListener('click', () => {
        angle = entry.angle; setMode(entry.mode); updateAngle();
        if (entry.mode === 'equation' && ['linear', 'quadratic', 'system'].includes(entry.kind) && Array.isArray(entry.values)) {
          $('equation-kind').value = entry.kind; renderEquation();
          document.querySelectorAll('.coefficient').forEach((el, i) => { el.value = entry.values[i] ?? ''; });
          solveEquation(false);
        } else { input.value = entry.expression; completed = false; evaluate(false, entry.ans); }
      });
      list.append(button);
    });
  }
  function naturalDisplay() {
    $('natural').replaceChildren();
    if (!input.value) { $('natural').textContent = '准备好，开始一次计算'; return; }
    // Render only text nodes and explicit superscripts; input never becomes HTML.
    const text = input.value.replace(/sqrt\(/g, '√(').replace(/\*/g, '×').replace(/\//g, '÷').replace(/pi/g, 'π');
    const pieces = text.split(/(\^(?:\([^)]*\)|[+-]?\d+(?:\.\d+)?))/g);
    for (const piece of pieces) {
      if (piece.startsWith('^')) { const sup = document.createElement('sup'); sup.textContent = piece.slice(1); $('natural').append(sup); }
      else $('natural').append(document.createTextNode(piece));
    }
  }
  function setMode(next) {
    mode = next;
    document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
    $('calculation-panel').hidden = mode === 'equation'; $('equation-panel').hidden = mode !== 'equation';
    $('screen-mode').textContent = mode === 'complex' ? 'CMPLX' : 'COMP';
    $('error').textContent = ''; updateContext();
  }
  function updateAngle() {
    $('angle-indicator').textContent = angle;
    $('angle-toggle').replaceChildren(document.createTextNode(angle + ' '));
    const hint = document.createElement('span'); hint.textContent = '⇄ ' + (angle === 'DEG' ? 'RAD' : 'DEG'); $('angle-toggle').append(hint);
    updateContext();
  }
  function updateContext() {
    const box = $('context-content'); box.replaceChildren();
    if (mode === 'complex') {
      $('context-label').textContent = '复数 · 坐标解析';
      const summary = E.polar(lastResult, angle), unit = angle === 'DEG' ? '°' : ' rad';
      const grid = document.createElement('div'); grid.className = 'polar-grid';
      const entries = [['直角坐标', E.format(lastResult)], ['模长 |z|', E.formatNumber(summary.magnitude)], ['相角 arg(z)', summary.phase === null ? '未定义（零复数）' : E.formatNumber(summary.phase) + unit], ['极坐标', summary.phase === null ? '0（相角未定义）' : E.formatNumber(summary.magnitude) + ' ∠ ' + E.formatNumber(summary.phase) + unit]];
      entries.forEach(([label, value], i) => { const cell = document.createElement('div'); if (i === 0 || i === 3) cell.className = 'polar-full'; const small = document.createElement('small'); small.textContent = label; const strong = document.createElement('strong'); strong.textContent = value; cell.append(small, strong); grid.append(cell); });
      box.append(grid);
      const tip = document.createElement('p'); tip.textContent = '以最近一次成功计算为准；使用 j 输入虚数单位。'; tip.style.marginTop = '14px'; box.append(tip);
    } else if (mode === 'equation') {
      $('context-label').textContent = '求解小贴士';
      box.innerHTML = '<h2>从系数，到答案。</h2><p>一元方程右侧统一为 0。<br>方程组右侧填写常数项。<br>二次项系数为 0 时，自动按一次方程求解。</p>';
    } else {
      $('context-label').textContent = '计算小贴士';
      box.innerHTML = '<h2>一点灵感，无限可能。</h2><p>支持括号、分数、科学函数与隐式乘法。<br>百分数按 ÷100 计算；a/b 表示分数。<br>当前为 ' + (angle === 'DEG' ? '角度制：sin(30) = 0.5' : '弧度制：sin(π/2) = 1') + '。</p>';
      const example = document.createElement('button'); example.className = 'example'; example.textContent = '试一试： (2 + 3) × 4  ↗'; example.addEventListener('click', () => { input.value = '(2+3)×4'; evaluate(); }); box.append(example);
    }
  }
  function evaluate(record = true, recalledAns) {
    try {
      const usedAns = recalledAns && Number.isFinite(recalledAns.re) && Number.isFinite(recalledAns.im) ? recalledAns : ans;
      const result = E.calculate(input.value, { angle, ans: usedAns, complex: mode === 'complex' });
      ans = result; lastResult = result; resultValid = true; completed = true;
      $('result').textContent = E.format(result); $('error').textContent = '';
      naturalDisplay(); updateContext();
      if (record) pushHistory({ expression: input.value, result: E.format(result), mode, ans: usedAns });
    } catch (error) {
      $('error').textContent = error.message; $('result').textContent = '—'; resultValid = false; completed = false;
    }
  }
  function insert(text, fromKeyboard = false) {
    if (text === 'j' && mode !== 'complex') setMode('complex');
    if (completed) {
      input.value = /^[+×÷*/^!%\-]/.test(text) ? 'Ans' : '';
      completed = false;
    }
    if (fromKeyboard) input.focus({ preventScroll: true });
    const start = input.selectionStart, end = input.selectionEnd;
    if (input.value.length - (end - start) + text.length > 1000) { toast('表达式最多 1000 个字符。'); return; }
    input.setRangeText(text, start, end, 'end');
    edited();
  }
  function edited() { completed = false; $('error').textContent = ''; naturalDisplay(); }
  function clear(fromKeyboard = false) { input.value = ''; $('result').textContent = '0'; $('error').textContent = ''; completed = false; resultValid = true; lastResult = E.C(); naturalDisplay(); updateContext(); if (fromKeyboard) input.focus({ preventScroll: true }); }
  function remove(fromKeyboard = false) {
    if (fromKeyboard) input.focus({ preventScroll: true });
    const start = input.selectionStart, end = input.selectionEnd;
    input.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end'); edited();
  }
  function toggleShift() {
    shifted = !shifted; $('shift').setAttribute('aria-pressed', shifted); $('shift-indicator').hidden = !shifted;
    document.querySelectorAll('[data-shift]').forEach(button => { button.textContent = shifted ? button.dataset.shift.slice(0, -1) : button.dataset.insert.slice(0, -1); });
    $('key-hint').textContent = shifted ? '反三角函数已启用 · 点击后自动恢复' : '按 SHIFT 使用反三角函数';
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('keys').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.insert) { insert(shifted && button.dataset.shift ? button.dataset.shift : button.dataset.insert); if (shifted) toggleShift(); }
    else if (button.dataset.action === 'equals') evaluate();
    else if (button.dataset.action === 'clear') clear();
    else if (button.dataset.action === 'delete') remove();
  });
  input.addEventListener('input', edited);
  $('shift').addEventListener('click', toggleShift);
  $('angle-toggle').addEventListener('click', () => { angle = angle === 'DEG' ? 'RAD' : 'DEG'; updateAngle(); toast('已切换为' + (angle === 'DEG' ? '角度制 DEG' : '弧度制 RAD') + '，按 = 重新计算'); });
  $('copy-result').addEventListener('click', async () => {
    if (!resultValid) { toast('请先完成一次有效计算。'); return; }
    const text = E.format(lastResult);
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
        const ok = document.execCommand('copy'); field.remove(); if (!ok) throw Error('copy');
      }
      toast('计算结果已复制');
    } catch { toast('复制未获浏览器允许，可直接选中结果复制。'); }
  });
  $('history-toggle').addEventListener('click', () => { const hidden = !$('history-card').hidden; $('history-card').hidden = hidden; $('history-toggle').setAttribute('aria-expanded', !hidden); if (!hidden && window.innerWidth < 650) $('history-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $('clear-history').addEventListener('click', () => { history = []; saveHistory(); toast('历史记录已清空'); });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target, field = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    if (target instanceof HTMLAnchorElement) return;
    if (mode === 'equation') return;
    if (event.key === 'Enter' && (!field || target === input)) { event.preventDefault(); evaluate(); return; }
    if (event.key === 'Escape') { event.preventDefault(); clear(true); return; }
    if (field && target !== input) return;
    if (event.key === 'Backspace' && target !== input) { event.preventDefault(); remove(true); return; }
    if (event.key === '=' && target === input) { event.preventDefault(); evaluate(); return; }
    if (event.key.length === 1 && /[0-9a-zA-Z.+\-*/^()!%π√°]/.test(event.key)) {
      event.preventDefault(); insert(event.key, true);
    }
  });
  const definitions = {
    linear: { template: 'ax + b = 0', labels: ['a', 'b'], defaults: [2, -6] },
    quadratic: { template: 'ax² + bx + c = 0', labels: ['a', 'b', 'c'], defaults: [1, -5, 6] },
    system: { template: 'ax + by = c\ndx + ey = f', labels: ['a', 'b', 'c', 'd', 'e', 'f'], defaults: [1, 1, 3, 1, -1, 1] }
  };
  function renderEquation() {
    const definition = definitions[$('equation-kind').value]; $('equation-template').textContent = definition.template;
    const fields = $('coefficient-fields'); fields.replaceChildren();
    definition.labels.forEach((name, i) => {
      const label = document.createElement('label'); label.textContent = name;
      const field = document.createElement('input'); field.type = 'number'; field.step = 'any'; field.required = true; field.className = 'coefficient'; field.value = definition.defaults[i]; field.setAttribute('aria-label', '系数 ' + name); label.append(field); fields.append(label);
    });
    $('equation-result').textContent = '填写系数后，点击求解。';
  }
  function solveEquation(record = true) {
    const box = $('equation-result'); box.replaceChildren();
    try {
      const values = [...document.querySelectorAll('.coefficient')].map(field => field.value.trim() === '' ? NaN : Number(field.value));
      const kind = $('equation-kind').value, solution = E.solve(kind, values);
      if (solution.roots.some(([, value]) => !Number.isFinite(value.re) || !Number.isFinite(value.im))) throw Error('系数跨度过大，结果超出范围，请调整系数。');
      const results = solution.roots.map(([label, value]) => label + ' = ' + E.format(value));
      if (solution.message) box.textContent = solution.message;
      else for (const result of results) { const line = document.createElement('div'); line.className = 'equation-root'; line.textContent = result; box.append(line); }
      if (kind === 'quadratic' && values[0] === 0) { const note = document.createElement('p'); note.className = 'equation-warning'; note.textContent = 'a = 0，已按一元一次方程求解。'; box.append(note); }
      if (record) pushHistory({ mode: 'equation', kind, values, expression: definitions[kind].template + ' [' + values.join(', ') + ']', result: solution.message || results.join('；') });
    } catch (error) { const line = document.createElement('span'); line.className = 'equation-error'; line.textContent = error.message; box.append(line); }
  }
  $('equation-kind').addEventListener('change', renderEquation);
  $('equation-form').addEventListener('submit', event => { event.preventDefault(); solveEquation(); });
  renderEquation(); renderHistory(); updateContext(); naturalDisplay();
})();
