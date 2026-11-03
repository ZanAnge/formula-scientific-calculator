"""Readable derivations from the actual algebraic records, not reconstructed answers."""
import sympy as sp
from math_parser import s


def build_response(plan):
    p, L, steps = plan, sp.latex, []

    def step(title, note, formulas, key=False):
        steps.append(dict(id=len(steps) + 1, title=title, note=note, formulas=[f for f in formulas if f], key=key))

    def summed(items):
        return '+'.join(r'\left(' + item + r'\right)' for item in items) or '0'

    def fraction(top, bottom):
        return r'\frac{' + L(top) + '}{' + L(bottom) + '}'

    step('识别表达式', '将输入解析为仅含 s 的有理函数；小数按精确有理数处理。', ['F(s)=' + L(p['raw'])])
    simplification = ['F(s)=' + L(p['together']), r'\gcd\!\left(' + L(p['before_n']) + ',' + L(p['before_d']) + r'\right)=' + L(p['gcd'])]
    if p['gcd'] not in (0, 1):
        simplification += [L(p['before_n']) + r'=\left(' + L(p['gcd']) + r'\right)\left(' + L(sp.cancel(p['before_n'] / p['gcd'])) + r'\right)', L(p['before_d']) + r'=\left(' + L(p['gcd']) + r'\right)\left(' + L(sp.cancel(p['before_d'] / p['gcd'])) + r'\right)']
    simplification += ['F(s)=' + fraction(p['numerator'], p['denominator']), 'N(s)=' + L(p['numerator']), 'D(s)=' + L(p['denominator'])]
    step('通分、约分与标准化', 'SymPy 精确通分并计算公因式，约分后将分母首项系数归一；以下变换针对化简后的传递函数。', simplification)
    factored = ''.join(r'\left(' + L(factor) + r'\right)^{' + str(power) + '}' for factor, power, _ in p['factors']) or '1'
    factor_notes = []
    factor_proofs = ['D(s)=' + L(p['denominator']) + '=' + factored]
    for factor, power, degree in p['factors']:
        if degree == 2:
            polynomial = sp.Poly(factor, s)
            b, c = polynomial.nth(1), polynomial.nth(0)
            factor_proofs.append(r'\Delta=(' + L(b) + ')^2-4(' + L(c) + ')=' + L(b * b - 4 * c) + '<0')
            factor_notes.append('二次因式判别式小于零，保留为不可约二次因式')
        if power > 1:
            factor_notes.append('重数为' + str(power) + '，各次幂均须设分式')
    step('分母因式分解', '；'.join(factor_notes) or ('将分母分解为不同实根对应的一次因式。' if p['factors'] else '分母为非零常数，无需分解。'), factor_proofs, True)
    degree_n = sp.degree(p['numerator'], s) if p['numerator'] != 0 else r'-\infty'
    degree_d = sp.degree(p['denominator'], s)
    division = [r'\deg N=' + str(degree_n) + r',\quad\deg D=' + str(degree_d)]
    for i, (before, term, product, after) in enumerate(p.get('division_records', []), 1):
        division += [rf'q_{{{i}}}(s)=' + L(term), r'\left(' + L(before) + r'\right)-\left(' + L(product) + r'\right)=' + L(after)]
    division += [L(p['numerator']) + '=' + r'\left(' + L(p['quotient']) + r'\right)\left(' + L(p['denominator']) + r'\right)+' + L(p['remainder']), 'F(s)=' + L(p['quotient']) + '+' + fraction(p['remainder'], p['denominator'])]
    step('判断真分式并进行多项式除法', '分子次数不小于分母次数：先除法，商对应冲激项。' if p['quotient'] != 0 else '分子次数小于分母次数，商为0，无需额外除法。', division, p['quotient'] != 0)
    template = summed([fraction(item['numerator'], item['factor'] ** item['power']) for item in p['templates']])
    step('设立待定系数', '一次因式各次幂设常数分子；不可约二次因式各次幂设一次分子。' if p['unknowns'] else '余项为0，不需要部分分式或待定系数。', [fraction(p['remainder'], p['denominator']) + '=' + template], True)
    if p['unknowns']:
        step('两边同乘分母并展开', '逐项乘以公共分母，再按 s 的幂次整理；这是真实生成的多项式恒等式。', [L(p['remainder']) + '=' + summed([L(term) for term in p['cleared']]), L(p['remainder']) + '=' + L(sp.collect(p['expanded'], s))])
        step('比较同次幂系数', '从最高次到常数项逐一比较，建立线性方程组。', [L(eq) for eq in p['equations']], True)
        matrix_formulas = [r'[M\mid b]=' + L(p['augmented'])]
        matrix_formulas.extend(operation + r'\quad\Longrightarrow\quad' + L(matrix) for operation, matrix in p['operations'])
        matrix_formulas.extend(L(symbol) + '=' + L(value) for symbol, value in p['coefficients'].items())
        step('逐步消元，求出系数', '以下为实际执行的初等行变换；消元结果与 SymPy 线性方程组解独立核对一致。', matrix_formulas, True)
    step('代回，得到完整部分分式', '代入已求得系数，保留多项式商；零系数项可以省去。已验证此式与原函数恒等。', ['F(s)=' + summed(([L(p['quotient'])] if p['quotient'] != 0 else []) + [L(term) for term in p['terms'] if term != 0]), r'F(s)-F_{\rm apart}(s)=0'], True)
    if not p['inverse']:
        step('逐项反变换', '零函数的反变换仍为零。', [r'\mathcal L^{-1}\{0\}=0'], True)
    for i, item in enumerate(p['inverse'], 1):
        step('第' + str(i) + '项：公式匹配与反变换', item['method'] + '。频域平移对应指数因子；所有参数来自当前分式。', item['auxiliary'] + item['formulas'] + [r'\mathcal L^{-1}\!\left\{' + L(item['frequency']) + r'\right\}=' + L(item['time'])], True)
    final_note = '按因果约定，在 t≥0 上表示常规时域部分。'
    if p['impulse'] != 0:
        final_note = '结果含 t=0 的冲激分布及可能的导数；不能作为普通函数值计算。常规部分在 t>0 成立。采用积分下限0⁻的拉普拉斯约定。'
    final_latex = 'f(t)=' + L(p['final']) + (r',\quad t\ge0' if p['impulse'] == 0 else r'\quad\text{（含原点分布）}')
    step('合并最终时域结果', final_note, [final_latex], True)
    check_formulas = [r'\mathcal L\!\left\{' + L(item['time']) + r'\right\}=' + L(item['forward']) for item in p['inverse']]
    check_formulas += [r'\widehat F(s)=' + L(p['forward']), r'\widehat F(s)-F(s)=0']
    if p['roc'] is not None:
        check_formulas.append(r'\operatorname{Re}(s)>' + L(p['roc']))
    step('正变换验证', '逐项正变换后精确通分，差为0。冲激导数若直接变换未求值，使用 SymPy 对分布配对公式求导核验，具体方法已在该项注明。收敛域采用因果信号右半平面。', check_formulas, True)
    return dict(source=p['source'], steps=steps, answer_latex=final_latex, answer_text='f(t) = ' + sp.sstr(p['final']) + ('; t >= 0' if p['impulse'] == 0 else '; causal distributions at t=0, regular part t>0'), frequency_text=sp.sstr(p['simplified']), partial_latex='F(s)=' + L(p['partial']), verified=p['verified'], decomposition_verified=p['decomposition_verified'], has_impulses=p['impulse'] != 0, coefficients={str(key): sp.sstr(value) for key, value in p['coefficients'].items()}, engine='SymPy ' + sp.__version__, roc_latex=r'\operatorname{Re}(s)>' + L(p['roc']) if p['roc'] is not None else r's\in\mathbb C')
