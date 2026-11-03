'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let solution = null, view = 'detail', busy = false, toastTimer;
  const frequency = $('frequency-input');
  let editingField = frequency;
  frequency.addEventListener('focus', () => editingField = frequency);
  let powerTarget = null;
  frequency.setSelectionRange(frequency.value.length, frequency.value.length);
  const powerTools = document.createElement('div');
  powerTools.className = 'frequency-tools'; powerTools.setAttribute('aria-label', '幂次输入工具');
  for (const [label, text] of [['s', 's'], ['s²', 's^2'], ['s³', 's^3'], ['x²', '^2'], ['x³', '^3'], ['xⁿ', null]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.title = label === 'xⁿ' ? '选择任意整数指数' : label.startsWith('x') ? '在光标处加幂；选中部分会整体加幂' : '插入 ' + label;
    button.addEventListener('click', () => {
      if (busy) return;
      const target = { field: editingField, value: editingField.value, start: editingField.selectionStart, end: editingField.selectionEnd };
      if (text === null) {
        powerTarget = target; $('custom-power-fields').hidden = !$('custom-power-fields').hidden;
        button.setAttribute('aria-expanded', !$('custom-power-fields').hidden);
      } else insertFrequency(text, label.startsWith('x'), target);
    });
    if (text === null) { button.id = 'custom-power-toggle'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'custom-power-fields'); }
    powerTools.append(button);
  }
  frequency.after(powerTools);
  const powerFields = document.createElement('div'); powerFields.id = 'custom-power-fields'; powerFields.hidden = true;
  powerFields.innerHTML = '<label for="power-exponent">指数（-12 到 12 的整数）</label><div class="power-exponent-row"><input id="power-exponent" type="number" min="-12" max="12" step="1" value="4"><button id="apply-power" type="button">插入次方</button><button id="cancel-power" type="button">取消</button></div>';
  powerTools.after(powerFields);
  function closePower() { powerFields.hidden = true; $('custom-power-toggle').setAttribute('aria-expanded', 'false'); }
  function insertFrequency(text, isPower, target) {
    if (busy || frequency.readOnly) return;
    const field = target.field || frequency;
    if (field.value !== target.value) { closePower(); toast('表达式已修改，请重新选择要加幂的位置。'); return; }
    const selected = target.value.slice(target.start, target.end);
    if (isPower && !selected && !/[\ds²³)）]$/.test(target.value.slice(0, target.start).trimEnd())) { toast('请先输入底数或选中表达式，例如 s 或 (s+1)。'); return; }
    const insertion = isPower && selected ? '(' + selected + ')' + text : text;
    if (field.value.length - selected.length + insertion.length > 500) { toast('表达式最多500个字符。'); return; }
    field.setRangeText(insertion, target.start, target.end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    closePower();
  }
  function applyPower() {
    const raw = $('power-exponent').value.trim(), exponent = Number(raw);
    if (!raw || !Number.isInteger(exponent) || exponent < -12 || exponent > 12) { toast('请输入 -12 到 12 的整数指数。'); return; }
    if (powerTarget) insertFrequency('^(' + exponent + ')', true, powerTarget);
  }
  $('apply-power').addEventListener('click', applyPower);
  $('cancel-power').addEventListener('click', closePower);
  $('power-exponent').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); applyPower(); }
    if (event.key === 'Escape') { event.preventDefault(); closePower(); }
  });
  const fractionFields = document.createElement('div');
  fractionFields.id = 'fraction-fields'; fractionFields.hidden = true;
  fractionFields.innerHTML = '<div class="fraction-caption">输入分数 · 分母自动加括号</div><label for="fraction-numerator">分子</label><input id="fraction-numerator" type="text" maxlength="500" autocomplete="off" spellcheck="false"><div class="fraction-rule" aria-hidden="true"></div><label for="fraction-denominator">分母</label><input id="fraction-denominator" type="text" maxlength="500" autocomplete="off" spellcheck="false" placeholder="例如 s(s+1)"><div class="fraction-actions"><button id="apply-fraction" type="button">插入分数</button><button id="cancel-fraction" type="button">取消</button></div>';
  powerFields.after(fractionFields);
  let fractionTarget = null;
  for (const id of ['fraction-numerator', 'fraction-denominator']) $(id).addEventListener('focus', event => editingField = event.target);
  function closeFraction() { fractionFields.hidden = true; editingField = frequency; }
  function openFraction() {
    if (busy) return;
    if (!fractionFields.hidden) { toast('请先插入或取消当前分数。'); return; }
    closePower();
    const selected = frequency.selectionStart !== frequency.selectionEnd;
    fractionTarget = { value: frequency.value, start: selected ? frequency.selectionStart : 0, end: selected ? frequency.selectionEnd : frequency.value.length };
    $('fraction-numerator').value = frequency.value.slice(fractionTarget.start, fractionTarget.end) || '1';
    $('fraction-denominator').value = '';
    fractionFields.hidden = false; editingField = $('fraction-denominator');
    toast('可直接用下方键盘输入分母；点击分子框可切换编辑。');
  }
  function commitFraction() {
    if (busy || !fractionTarget) return false;
    const numerator = $('fraction-numerator').value.trim(), denominator = $('fraction-denominator').value.trim();
    if (!numerator || !denominator) { toast('请填写分子和分母。'); return false; }
    if (frequency.value !== fractionTarget.value) { toast('原表达式已修改，请取消后重新插入分数。'); return false; }
    const text = '(' + numerator + ')/(' + denominator + ')';
    if (frequency.value.length - (fractionTarget.end - fractionTarget.start) + text.length > 500) { toast('表达式最多500个字符。'); return false; }
    frequency.setRangeText(text, fractionTarget.start, fractionTarget.end, 'end');
    frequency.dispatchEvent(new Event('input', { bubbles: true }));
    closeFraction(); return true;
  }
  $('apply-fraction').addEventListener('click', commitFraction);
  $('cancel-fraction').addEventListener('click', closeFraction);
  const keypad = document.createElement('div'); keypad.className = 'keys laplace-keypad'; keypad.setAttribute('aria-label', '拉普拉斯计算键盘');
  const labels = ['(', ')', '←', '→', 'a/b', '7', '8', '9', 'DEL', 'AC', '4', '5', '6', '×', '÷', '1', '2', '3', '+', '−', '0', '.', 's', '^', '='];
  for (const label of labels) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.className = /^\d$|^\.$/.test(label) ? 'number' : label === 'AC' ? 'clear' : label === 'DEL' ? 'delete' : label === '=' ? 'equals' : 'operator';
    if (label === 'a/b') button.title = '输入分数，自动给分母加括号';
    button.addEventListener('click', () => {
      if (busy) return;
      if (label === '=') { solve(); return; }
      if (label === 'a/b') { openFraction(); return; }
      const field = editingField, start = field.selectionStart, end = field.selectionEnd;
      if (label === 'AC') { field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true })); return; }
      if (label === 'DEL') { field.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end'); field.dispatchEvent(new Event('input', { bubbles: true })); return; }
      if (label === '←' || label === '→') { const at = label === '←' ? (start !== end ? start : Math.max(0, start - 1)) : (start !== end ? end : Math.min(field.value.length, end + 1)); field.setSelectionRange(at, at); return; }
      insertFrequency(label === '−' ? '-' : label, false, { field, value: field.value, start, end });
    });
    keypad.append(button);
  }
  fractionFields.after(keypad);
  const formulaButtons = () => document.querySelectorAll('.answer-tools button');
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('数学表达式已复制'); }
    catch { toast('浏览器未允许复制，请选中公式手动复制。'); }
  }
  function math(element, latex) {
    if (!window.katex) { element.textContent = latex; return; }
    katex.render(latex, element, { displayMode: true, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 1000 });
  }
  function setView(next) {
    view = next; document.querySelector('.solution-board').dataset.view = view;
    document.querySelectorAll('[data-view]').forEach(button => { const selected = button.dataset.view === view; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected); });
    $('expand-all').disabled = busy || !solution || view === 'answer'; $('collapse-all').disabled = busy || !solution || view === 'answer';
  }
  function render(data) {
    $('solution-placeholder').hidden = true; $('solution-output').hidden = false;
    math($('answer-formula'), data.answer_latex);
    $('verification-badge').textContent = data.verified && data.decomposition_verified ? '✓ 精确验证通过' : '验证未完成';
    $('answer-note').textContent = data.has_impulses ? '含 t=0 的冲激分布及其导数，采用 0⁻ 下限约定；常规部分在 t>0 成立。' : '因果约定：t ≥ 0。完整推导包含逐项正变换及收敛域。';
    $('steps-container').replaceChildren();
    data.steps.forEach(step => {
      const details = document.createElement('details'); details.className = 'solution-step' + (step.key ? ' key-step' : ''); details.open = true;
      const summary = document.createElement('summary'), number = document.createElement('span'); number.className = 'step-number'; number.textContent = String(step.id).padStart(2, '0'); summary.append(number, document.createTextNode(step.title));
      const body = document.createElement('div'); body.className = 'step-body';
      const note = document.createElement('p'); note.textContent = step.note; body.append(note);
      step.formulas.forEach(latex => { const row = document.createElement('div'); row.className = 'formula-row'; const formula = document.createElement('div'); formula.className = 'math-block'; math(formula, latex); const button = document.createElement('button'); button.className = 'formula-copy'; button.textContent = '复制此式 LaTeX'; button.addEventListener('click', () => copy(latex)); row.append(formula, button); body.append(row); });
      details.append(summary, body); $('steps-container').append(details);
    });
    $('engine-note').textContent = data.engine + ' · 精确有理运算 · 部分分式恒等与正变换均核对为零差。公式由本地 KaTeX 渲染。';
    setView(view);
  }
  async function solve() {
    if (busy) return;
    if (!fractionFields.hidden && !commitFraction()) return;
    const expression = $('frequency-input').value.trim();
    if (!expression) { $('solver-error').textContent = '请先输入 F(s)。'; return; }
    busy = true; solution = null; $('solver-error').textContent = ''; $('full-solve').disabled = true; $('full-solve').textContent = '正在精确求解…';
    closePower(); powerTools.querySelectorAll('button').forEach(button => button.disabled = true); keypad.querySelectorAll('button').forEach(button => button.disabled = true);
    $('frequency-input').readOnly = true;
    $('solution-output').hidden = true; $('solution-placeholder').hidden = false;
    $('solver-status').textContent = '正在分解、解系数方程并验证变换，最长20秒。';
    document.querySelectorAll('[data-example]').forEach(button => button.disabled = true); formulaButtons().forEach(button => button.disabled = true); setView(view);
    try {
      if (location.protocol === 'file:') throw Error('请通过分享网址打开此页面；直接打开下载的HTML文件无法加载完整计算引擎。');
      const data = await BrowserSolver.solve(expression, message => $('solver-status').textContent = message);
      if (!data.ok) throw Error(data.error || '求解失败，请检查表达式。');
      solution = data; render(data); $('solver-status').textContent = '求解完成 · ' + data.steps.length + ' 个推导步骤 · 精确验证通过';
    } catch (error) {
      $('solver-error').textContent = error.name === 'AbortError' ? '请求超时，请简化表达式后重试。' : error.message === 'Failed to fetch' ? '本地服务未连接。请运行 python server.py，刷新后重试。' : error.message;
      $('solver-status').textContent = '未生成答案；请修改输入后重试。';
    } finally {
      busy = false; $('full-solve').disabled = false; $('full-solve').innerHTML = '完整求解 <span>→</span>';
      $('frequency-input').readOnly = false;
      powerTools.querySelectorAll('button').forEach(button => button.disabled = false);
      keypad.querySelectorAll('button').forEach(button => button.disabled = false);
      document.querySelectorAll('[data-example]').forEach(button => button.disabled = false); formulaButtons().forEach(button => button.disabled = !solution); setView(view);
    }
  }
  $('solve-form').addEventListener('submit', event => { event.preventDefault(); solve(); });
  $('frequency-input').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); solve(); } });
  $('frequency-input').addEventListener('input', () => { if (solution) $('solver-status').textContent = '输入已修改，下方为上一次结果；点击完整求解更新。'; });
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { closeFraction(); $('frequency-input').value = button.dataset.example; solve(); }));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('expand-all').addEventListener('click', () => document.querySelectorAll('.solution-step').forEach(step => step.open = true));
  $('collapse-all').addEventListener('click', () => document.querySelectorAll('.solution-step').forEach(step => step.open = false));
  $('copy-answer').addEventListener('click', () => { if (solution) copy(solution.answer_text); });
  $('copy-latex').addEventListener('click', () => { if (solution) copy(solution.answer_latex); });
  $('copy-frequency').addEventListener('click', () => { if (solution) copy('F(s) = ' + solution.frequency_text); });
  $('copy-derivation').addEventListener('click', () => { if (solution) copy(solution.steps.map(step => step.id + '. ' + step.title + '\n' + step.note + '\n' + step.formulas.map(formula => '$$' + formula + '$$').join('\n')).join('\n\n')); });
  formulaButtons().forEach(button => button.disabled = true); setView(view);
})();
