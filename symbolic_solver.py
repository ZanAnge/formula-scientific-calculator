"""Exact algebra, coefficient elimination and transform verification using SymPy."""
import sympy as sp
from math_parser import InputError, parse_rational, s

t = sp.Symbol('t', real=True)


def zero(expr):
    return sp.simplify(sp.cancel(expr, extension=True)) == 0


def eliminate(matrix):
    """Record the actual elementary operations used to solve the system."""
    m = matrix.copy()
    operations, row = [], 0
    for col in range(m.cols - 1):
        pivot = next((i for i in range(row, m.rows) if not zero(m[i, col])), None)
        if pivot is None:
            continue
        if pivot != row:
            m.row_swap(row, pivot)
            operations.append((rf'R_{{{row + 1}}}\leftrightarrow R_{{{pivot + 1}}}', m.copy()))
        coefficient = m[row, col]
        if coefficient != 1:
            for j in range(m.cols):
                m[row, j] = sp.simplify(m[row, j] / coefficient)
            operations.append((rf'R_{{{row + 1}}}\leftarrow R_{{{row + 1}}}/\left({sp.latex(coefficient)}\right)', m.copy()))
        for i in range(m.rows):
            coefficient = m[i, col]
            if i != row and coefficient != 0:
                for j in range(m.cols):
                    m[i, j] = sp.simplify(m[i, j] - coefficient * m[row, j])
                operations.append((rf'R_{{{i + 1}}}\leftarrow R_{{{i + 1}}}-\left({sp.latex(coefficient)}\right)R_{{{row + 1}}}', m.copy()))
        row += 1
        if row == m.rows:
            break
    return m, operations


def real_factors(denominator):
    """Split real quadratic roots, retain irreducible real quadratics."""
    factors = []
    for factor, multiplicity in sp.factor_list(denominator, s)[1]:
        polynomial = sp.Poly(factor, s).monic()
        if polynomial.degree() > 2:
            raise InputError('当前支持实数一次因式和实数不可约二次因式。该分母含有无法在有理数域分解的三次或更高因式，暂不生成推导。')
        factor = polynomial.as_expr()
        if polynomial.degree() == 2:
            b, c = polynomial.nth(1), polynomial.nth(0)
            discriminant = b * b - 4 * c
            if discriminant >= 0:
                roots = [(-b + sp.sqrt(discriminant)) / 2, (-b - sp.sqrt(discriminant)) / 2]
                if roots[0] == roots[1]:
                    factors.append((s - roots[0], multiplicity * 2, 1))
                else:
                    factors.extend((s - root, multiplicity, 1) for root in roots)
                continue
        factors.append((factor, multiplicity, polynomial.degree()))
    return factors


def invert_term(factor, power, numerator, degree):
    p = sp.Poly(factor, s)
    formulas, auxiliary = [], []
    if degree == 1:
        pole = -p.nth(0)
        time = numerator * t ** (power - 1) * sp.exp(pole * t) / sp.factorial(power - 1)
        formulas.append(r'\mathcal L^{-1}\!\left\{\frac{C}{(s-a)^k}\right\}=\frac{C\,t^{k-1}e^{at}}{(k-1)!},\quad k\ge1')
        return sp.simplify(time), formulas, auxiliary
    a = -p.nth(1) / 2
    omega = sp.sqrt(p.nth(0) - a * a)
    alpha = sp.expand(numerator).coeff(s, 1)
    beta = sp.expand(numerator).coeff(s, 0)
    shifted_constant = sp.simplify(beta + alpha * a)
    auxiliary.append(sp.latex(factor) + '=' + rf'(s-({sp.latex(a)}))^2+({sp.latex(omega)})^2')
    auxiliary.append(sp.latex(numerator) + '=' + sp.latex(alpha) + rf'(s-({sp.latex(a)}))+' + sp.latex(shifted_constant))
    if power == 1:
        time = sp.exp(a * t) * (alpha * sp.cos(omega * t) + shifted_constant / omega * sp.sin(omega * t))
        formulas.extend([
            r'\mathcal L^{-1}\!\left\{\frac{s-a}{(s-a)^2+\omega^2}\right\}=e^{at}\cos(\omega t)',
            r'\mathcal L^{-1}\!\left\{\frac{\omega}{(s-a)^2+\omega^2}\right\}=e^{at}\sin(\omega t)',
        ])
    else:
        w = sp.Symbol('w', positive=True)
        kernels = [None, sp.sin(w * t) / w]
        formulas.extend([
            r'K_1(t,\omega)=\frac{\sin(\omega t)}{\omega},\quad K_k=-\frac{1}{2(k-1)\omega}\frac{\partial K_{k-1}}{\partial\omega}',
            r'\mathcal L^{-1}\!\left\{\frac{1}{((s-a)^2+\omega^2)^k}\right\}=e^{at}K_k(t,\omega)',
            r'\mathcal L^{-1}\!\left\{\frac{s-a}{((s-a)^2+\omega^2)^k}\right\}=\frac{t e^{at}}{2(k-1)}K_{k-1}(t,\omega),\quad k>1',
        ])
        for k in range(2, power + 1):
            kernels.append(sp.simplify(-sp.diff(kernels[k - 1], w) / (2 * (k - 1) * w)))
            auxiliary.append(rf'K_{{{k}}}(t,{sp.latex(omega)})=' + sp.latex(kernels[k].subs(w, omega)))
        time = sp.exp(a * t) * (alpha * t * kernels[power - 1].subs(w, omega) / (2 * (power - 1)) + shifted_constant * kernels[power].subs(w, omega))
    return sp.simplify(time), formulas, auxiliary


def solve(source):
    raw = parse_rational(source, preserve=True)
    together = sp.together(raw)
    before_n, before_d = sp.fraction(raw)
    try:
        gcd = sp.gcd(sp.Poly(before_n, s, domain=sp.QQ), sp.Poly(before_d, s, domain=sp.QQ)).as_expr()
    except (sp.PolynomialError, sp.CoercionFailed):
        before_n, before_d = sp.fraction(together)
        gcd = sp.gcd(before_n, before_d)
    simplified = sp.cancel(raw)
    numerator, denominator = sp.fraction(simplified)
    try:
        n, d = sp.Poly(numerator, s, domain=sp.QQ), sp.Poly(denominator, s, domain=sp.QQ)
    except (sp.PolynomialError, sp.CoercionFailed) as exc:
        raise InputError('当前只支持实数有理系数的有理函数。') from exc
    if n.degree() > 10 or d.degree() > 8:
        raise InputError('当前上限：分子10次、分母8次；请拆分较复杂的题目。')
    if any(abs(c.p).bit_length() > 256 or c.q.bit_length() > 256 for c in n.all_coeffs() + d.all_coeffs()):
        raise InputError('系数数值过大，请缩小数值。')
    leading = d.LC()
    n, d = sp.Poly(n.as_expr() / leading, s), d.monic()
    N, D = n.as_expr(), d.as_expr()
    quotient, remainder = sp.div(n, d)
    Q, R = quotient.as_expr(), remainder.as_expr()
    division_records, current = [], n
    if n.degree() >= d.degree():
        while not current.is_zero and current.degree() >= d.degree():
            term = current.LC() / d.LC() * s ** (current.degree() - d.degree())
            next_remainder = current - sp.Poly(term, s) * d
            division_records.append((current.as_expr(), term, sp.expand(term * D), next_remainder.as_expr()))
            current = next_remainder
        if current != remainder:
            raise ArithmeticError('多项式长除法与 SymPy 结果不一致。')
    factors = real_factors(D)
    unknowns, templates, cleared_terms = [], [], []
    if R != 0:
        for factor, multiplicity, degree in factors:
            for power in range(1, multiplicity + 1):
                symbols = [sp.Symbol(chr(65 + len(unknowns) + i)) for i in range(degree)]
                unknowns.extend(symbols)
                top = symbols[0] if degree == 1 else symbols[0] * s + symbols[1]
                complement = sp.cancel(D / factor ** power, extension=True)
                complement = sp.simplify(complement)
                cleared_terms.append(sp.expand(top * complement))
                templates.append(dict(factor=factor, power=power, degree=degree, numerator=top))
    expanded = sp.expand(sum(cleared_terms))
    equations, operations, coefficients, augmented = [], [], {}, None
    if unknowns:
        lhs, rhs = sp.Poly(expanded, s), sp.Poly(R, s)
        equations = [sp.Eq(lhs.nth(i), rhs.nth(i), evaluate=False) for i in range(d.degree() - 1, -1, -1)]
        matrix, vector = sp.linear_eq_to_matrix([eq.lhs - eq.rhs for eq in equations], unknowns)
        augmented = matrix.row_join(vector)
        reduced, operations = eliminate(augmented)
        solution = next(iter(sp.linsolve((matrix, vector), unknowns)))
        if reduced[:, :-1] != sp.eye(len(unknowns)):
            raise InputError('系数方程没有得到唯一解，请检查表达式。')
        coefficients = dict(zip(unknowns, solution))
        if any(not zero(reduced[i, -1] - solution[i]) for i in range(len(solution))):
            raise ArithmeticError('系数消元与 SymPy 解不一致，已停止输出。')
    terms, inverse, regular, impulse, forward = [], [], sp.S.Zero, sp.S.Zero, sp.S.Zero
    for template in templates:
        top = sp.simplify(template['numerator'].subs(coefficients))
        expression = top / template['factor'] ** template['power']
        terms.append(expression)
        if top == 0:
            continue
        time, formulas, auxiliary = invert_term(template['factor'], template['power'], top, template['degree'])
        transformed = sp.laplace_transform(time, t, s, noconds=True)
        if transformed.has(sp.LaplaceTransform) or not zero(transformed - expression):
            raise ArithmeticError('本题的逐项正变换未通过验证，已停止输出，未把结果标记为正确。')
        # An independent inverse transform is compared on the causal t>0 branch.
        independent = sp.inverse_laplace_transform(expression, s, t).subs(sp.Heaviside(t), 1)
        if independent.has(sp.InverseLaplaceTransform) or not zero(independent - time):
            raise ArithmeticError('SymPy 独立反变换交叉检查未通过，已停止输出。')
        inverse.append(dict(frequency=expression, time=time, formulas=formulas, auxiliary=auxiliary, forward=transformed, method='SymPy 正变换与独立反变换'))
        regular += time
        forward += transformed
    for (power,), coefficient in quotient.terms():
        if coefficient == 0:
            continue
        time = coefficient * sp.DiracDelta(t, power)
        expression = coefficient * s ** power
        transformed = sp.laplace_transform(time, t, s, noconds=True)
        method = 'SymPy 正变换'
        if transformed.has(sp.LaplaceTransform):
            transformed = coefficient * (-1) ** power * sp.diff(sp.exp(-s * t), t, power).subs(t, 0)
            method = 'SymPy 计算分布配对（直接变换未求值）'
        if not zero(transformed - expression):
            raise ArithmeticError('冲激项的分布正变换验证失败。')
        formulas = [r'\mathcal L\{\delta^{(n)}(t)\}=s^n,\quad n\ge0\quad(0^-\text{ 下限})', r'\langle\delta^{(n)},e^{-st}\rangle=(-1)^n\left.\frac{d^n}{dt^n}e^{-st}\right|_{t=0}=s^n']
        inverse.append(dict(frequency=expression, time=time, formulas=formulas, auxiliary=[], forward=transformed, method=method))
        impulse += time
        forward += transformed
    partial = Q + sum(terms)
    decomposition_verified = zero(simplified - partial)
    forward_verified = zero(forward - simplified)
    if not decomposition_verified or not forward_verified:
        raise ArithmeticError('恒等式校验失败，已停止输出。')
    regular = sp.expand(regular)
    final = regular + impulse
    poles = []
    for factor, _, degree in factors:
        p = sp.Poly(factor, s)
        poles.append(-p.nth(0) if degree == 1 else -p.nth(1) / 2)
    from solution_steps import build_response
    return build_response(dict(source=source, raw=raw, together=together, before_n=before_n, before_d=before_d, gcd=gcd, simplified=simplified, numerator=N, denominator=D, quotient=Q, remainder=R, division_records=division_records, factors=factors, unknowns=unknowns, templates=templates, cleared=cleared_terms, expanded=expanded, equations=equations, augmented=augmented, operations=operations, coefficients=coefficients, terms=terms, partial=partial, inverse=inverse, regular=regular, impulse=impulse, final=final, forward=sp.cancel(forward), roc=sp.Max(*poles) if poles else None, verified=forward_verified, decomposition_verified=decomposition_verified))


if __name__ == '__main__':
    import json
    import sys
    try:
        request = json.load(sys.stdin)
        result = solve(request.get('expression'))
        print(json.dumps(dict(ok=True, **result), ensure_ascii=False))
    except (InputError, ArithmeticError) as exc:
        print(json.dumps(dict(ok=False, error=str(exc)), ensure_ascii=False))
    except Exception:
        print(json.dumps(dict(ok=False, error='符号求解未能完成，可能超出当前支持范围。请检查输入或简化题目。'), ensure_ascii=False))
