import json
import subprocess
import sys
import unittest
import http.client
import threading
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import sympy as sp
from math_parser import InputError, parse_rational, s
from symbolic_solver import solve


class SymbolicTests(unittest.TestCase):
    def test_chinese_parentheses_and_implicit_denominator(self):
        expected = 1 / (s * (s + 1))
        for expression in ['1/(s(s+1))', '1/（s（s+1））', 'F（s）=1/（s（s+1））', '(1)/(s(s+1))']:
            with self.subTest(expression=expression):
                self.assertEqual(sp.cancel(parse_rational(expression) - expected), 0)
                result = solve(expression)
                self.assertTrue(result['verified'])
                self.assertIn('1 - exp(-t)', result['answer_text'])

    def checked(self, expression):
        result = solve(expression)
        self.assertTrue(result['verified'])
        self.assertTrue(result['decomposition_verified'])
        self.assertTrue(all(step['formulas'] for step in result['steps']))
        self.assertTrue(all(isinstance(formula, str) for step in result['steps'] for formula in step['formulas']))
        return result

    def test_acceptance_and_coefficient_equations(self):
        result = self.checked('F(s)=(2s+5)/(s²+5s+6)')
        self.assertEqual(result['coefficients'], {'A': '1', 'B': '1'})
        self.assertIn('exp(-2*t) + exp(-3*t)', result['answer_text'])
        comparison = next(step for step in result['steps'] if step['title'] == '比较同次幂系数')
        self.assertEqual(len(comparison['formulas']), 2)
        self.assertIn('A + B = 2', comparison['formulas'])
        elimination = next(step for step in result['steps'] if step['title'] == '逐步消元，求出系数')
        self.assertTrue(any('Longrightarrow' in formula for formula in elimination['formulas']))

    def test_repeated_real_root(self):
        result = self.checked('(s+3)/(s+1)^2')
        self.assertEqual(set(result['coefficients'].values()), {'1', '2'})
        self.assertIn('t', result['answer_text'])

    def test_irreducible_quadratic(self):
        result = self.checked('(2s+5)/(s^2+2s+5)')
        self.assertEqual(result['coefficients'], {'A': '2', 'B': '5'})
        self.assertIn('sin(2*t)', result['answer_text'])
        self.assertIn('cos(2*t)', result['answer_text'])
        self.assertTrue(any('Delta' in formula for step in result['steps'] for formula in step['formulas']))

    def test_improper_with_impulse_derivative(self):
        result = self.checked('(s^2+2s+3)/(s+1)')
        self.assertTrue(result['has_impulses'])
        self.assertIn('DiracDelta(t, 1)', result['answer_text'])
        self.assertIn('DiracDelta(t)', result['answer_text'])
        division = next(step for step in result['steps'] if step['title'] == '判断真分式并进行多项式除法')
        self.assertTrue(any('q_{1}' in formula for formula in division['formulas']))
        self.assertTrue(any('分布配对' in step['note'] for step in result['steps']))

    def test_repeated_quadratic(self):
        result = self.checked('1/(s^2+1)^2')
        self.assertTrue(any('K_{2}' in formula for step in result['steps'] for formula in step['formulas']))
        self.assertIn('cos(t)', result['answer_text'])

    def test_repeated_quadratic_linear_numerator(self):
        result = self.checked('(2s+3)/(s^2+2s+5)^2')
        self.assertIn('exp(-t)', result['answer_text'])

    def test_mixed_factors(self):
        self.checked('(s+2)/((s+1)^2*(s^2+4))')

    def test_real_algebraic_roots(self):
        result = self.checked('1/(s^2-2)')
        self.assertIn('sqrt(2)', result['answer_text'])

    def test_sine_pair(self):
        result = self.checked('3/(s^2+9)')
        self.assertIn('sin(3*t)', result['answer_text'])

    def test_cosine_pair(self):
        result = self.checked('s/(s^2+9)')
        self.assertIn('cos(3*t)', result['answer_text'])

    def test_exponential_pair(self):
        result = self.checked('1/(s-2)')
        self.assertIn('exp(2*t)', result['answer_text'])
        self.assertEqual(result['roc_latex'], r'\operatorname{Re}(s)>2')

    def test_cancellation_and_zero(self):
        cancelled = self.checked('(s+2)/((s+2)*(s+1))')
        self.assertIn('exp(-t)', cancelled['answer_text'])
        self.assertIn('s + 2', cancelled['steps'][0]['formulas'][0])
        self.assertTrue(any('gcd' in formula and 's + 2' in formula for formula in cancelled['steps'][1]['formulas']))
        result = self.checked('0')
        self.assertEqual(result['coefficients'], {})
        self.assertFalse(result['has_impulses'])

    def test_polynomial_and_constant(self):
        self.assertTrue(self.checked('2')['has_impulses'])
        self.assertIn('DiracDelta(t, 2)', self.checked('s^2+1')['answer_text'])

    def test_exact_decimals_and_parser_precedence(self):
        self.assertEqual(parse_rational('0.1+0.2'), sp.Rational(3, 10))
        self.assertEqual(parse_rational('-s^2'), -s**2)
        self.assertEqual(parse_rational('2(s+1)'), 2*(s+1))
        self.assertEqual(parse_rational('s**-2'), s**-2)

    def test_unsupported_factor_and_functions(self):
        for expression in ['1/(s^3+s+1)', 'exp(-s)/s', 'sin(s)', '1/(s+a)', '__import__(1)', 's.__class__', '1/(s-s)', '1..2', '(s+1', 's^100', 's^0.5', '', '1'*501]:
            with self.subTest(expression=expression):
                with self.assertRaises(InputError):
                    solve(expression)

    def test_verification_failure_is_not_presented_as_success(self):
        with patch('symbolic_solver.sp.laplace_transform', return_value=sp.Integer(999)):
            with self.assertRaises(ArithmeticError):
                solve('1/(s+1)')

    def test_worker_protocol_and_error(self):
        worker = subprocess.run([sys.executable, str(ROOT / 'symbolic_solver.py')], input=json.dumps({'expression': '1/(s+1)'}), capture_output=True, encoding='utf-8', timeout=20, env=__import__('os').environ | {'PYTHONIOENCODING': 'utf-8'})
        self.assertEqual(worker.returncode, 0)
        self.assertTrue(json.loads(worker.stdout)['ok'])


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import server
        cls.module = server
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.original_port = server.PORT
        server.PORT = cls.httpd.server_port
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        cls.module.PORT = cls.original_port

    def request(self, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=25)
        try:
            connection.request('POST' if body is not None else 'GET', path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.read().decode('utf-8')
        finally:
            connection.close()

    def test_static_and_offline_assets(self):
        for path in ['/', '/solver.html', '/solver.js', '/vendor/katex/katex.min.js', '/vendor/katex/katex.min.css']:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 200)
        self.assertEqual(self.request('/requirements.txt')[0], 404)
        self.assertEqual(self.request('/../symbolic_solver.py')[0], 404)

    def test_real_api_success(self):
        code, body = self.request('/api/solve', json.dumps({'expression': '(2s+5)/(s^2+5s+6)'}), {'Content-Type': 'application/json'})
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(body)['verified'])

    def test_unsupported_api_input(self):
        code, body = self.request('/api/solve', json.dumps({'expression': 'exp(-s)/s'}), {'Content-Type': 'application/json'})
        self.assertEqual(code, 422)
        self.assertFalse(json.loads(body)['ok'])

    def test_invalid_request(self):
        self.assertEqual(self.request('/api/solve', '[]', {'Content-Type': 'application/json'})[0], 400)
        self.assertEqual(self.request('/api/solve', '{}', {'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request('/api/solve', 'x'*4097, {'Content-Type': 'application/json'})[0], 400)

    def test_external_origin_rejected(self):
        self.assertEqual(self.request('/api/solve', '{}', {'Content-Type': 'application/json', 'Origin': 'https://example.com'})[0], 403)

    def test_timeout_is_explicit(self):
        with patch('server.subprocess.run', side_effect=subprocess.TimeoutExpired('worker', 20)):
            code, body = self.request('/api/solve', json.dumps({'expression': '1/s'}), {'Content-Type': 'application/json'})
        self.assertEqual(code, 408)
        self.assertIn('20', json.loads(body)['error'])

    def test_busy_is_explicit(self):
        self.module.JOBS.acquire()
        self.module.JOBS.acquire()
        try:
            code, _ = self.request('/api/solve', json.dumps({'expression': '1/s'}), {'Content-Type': 'application/json'})
            self.assertEqual(code, 429)
        finally:
            self.module.JOBS.release()
            self.module.JOBS.release()


if __name__ == '__main__':
    unittest.main()
