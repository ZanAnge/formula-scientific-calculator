"""Restricted rational-expression parser. Never evaluates Python source."""
import re
import sympy as sp

s = sp.Symbol('s')


class InputError(ValueError):
    pass


def parse_rational(source, preserve=False):
    if not isinstance(source, str) or not source.strip():
        raise InputError('请输入复频域表达式 F(s)。')
    if len(source) > 500:
        raise InputError('表达式最多 500 个字符。')
    text = source.translate(str.maketrans({'（': '(', '）': ')'}))
    text = re.sub(r'^\s*F\s*\(\s*s\s*\)\s*=\s*', '', text)
    text = text.replace('²', '^2').replace('³', '^3').replace('−', '-').replace('×', '*').replace('÷', '/').replace('**', '^')
    tokens, pos = [], 0
    while pos < len(text):
        if text[pos].isspace():
            pos += 1
            continue
        match = re.match(r'(?:\d+\.?\d*|\.\d+)', text[pos:])
        if match:
            number = match.group()
            if len(number) > 18:
                raise InputError('单个数值最多 18 个字符，请缩小系数。')
            if tokens and tokens[-1][0] == 'number':
                raise InputError('数字格式有误，请检查小数点或缺失的运算符。')
            tokens.append(('number', sp.Rational(number)))
            pos += len(number)
        elif text[pos] == 's':
            tokens.append(('s', s))
            pos += 1
        elif text[pos] in '+-*/^()':
            tokens.append((text[pos], None))
            pos += 1
        else:
            raise InputError('当前仅支持变量 s、实数系数和有理运算。时移 exp(-as)、初始条件及其他函数暂不支持；正弦等请先写成对应的 F(s)。')
    if not tokens or len(tokens) > 250:
        raise InputError('表达式为空或过于复杂，最多 250 个符号。')
    tokens.append(('end', None))
    cursor, depth = 0, 0

    def expression(minimum=0):
        nonlocal cursor, depth
        depth += 1
        if depth > 40:
            raise InputError('表达式嵌套过深，最多 40 层。')
        token, value = tokens[cursor]
        cursor += 1
        if token in ('number', 's'):
            left = value
        elif token in ('+', '-'):
            left = expression(25)
            if token == '-':
                left = sp.Mul(-1, left, evaluate=not preserve)
        elif token == '(':
            left = expression()
            if tokens[cursor][0] != ')':
                raise InputError('缺少右括号。')
            cursor += 1
        else:
            raise InputError('表达式不完整，请检查括号及运算符。')
        while True:
            operator = tokens[cursor][0]
            implicit = operator in ('number', 's', '(')
            precedence = 10 if operator in ('+', '-') else 20 if operator in ('*', '/') or implicit else 30 if operator == '^' else -1
            if precedence < minimum:
                break
            if not implicit:
                cursor += 1
            right = expression(precedence + (0 if operator == '^' else 1))
            if implicit or operator == '*':
                left = sp.Mul(left, right, evaluate=not preserve)
            elif operator == '+':
                left = sp.Add(left, right, evaluate=not preserve)
            elif operator == '-':
                left = sp.Add(left, sp.Mul(-1, right, evaluate=not preserve), evaluate=not preserve)
            elif operator == '/':
                if sp.cancel(right) == 0:
                    raise InputError('分母不能为零。')
                left = sp.Mul(left, sp.Pow(right, -1, evaluate=not preserve), evaluate=not preserve)
            else:
                right = sp.cancel(right)
                if not right.is_Integer or abs(right) > 12:
                    raise InputError('幂指数必须是 -12 到 12 的整数。')
                if left == 0 and right <= 0:
                    raise InputError('零的非正次幂未定义。')
                left = sp.Pow(left, right, evaluate=not preserve)
            if sp.count_ops(left) > 180:
                raise InputError('表达式过于复杂，请简化后重试。')
        depth -= 1
        return left

    result = expression()
    if tokens[cursor][0] != 'end':
        raise InputError('括号不匹配或有多余内容。')
    return result
