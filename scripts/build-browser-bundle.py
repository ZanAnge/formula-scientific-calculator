"""Rebuild the browser's pure-Python ZIP after editing symbolic modules."""
from pathlib import Path
import importlib.metadata
from zipfile import ZipFile, ZIP_DEFLATED
import sympy
import mpmath

ROOT = Path(__file__).resolve().parents[1]
with ZipFile(ROOT / 'vendor/symbolic-python.zip', 'w', ZIP_DEFLATED) as archive:
    for module in [sympy, mpmath]:
        folder = Path(module.__file__).parent
        for path in folder.rglob('*'):
            if path.is_file() and not {'tests', '__pycache__'}.intersection(path.relative_to(folder).parts) and path.suffix != '.pyc':
                archive.write(path, Path(folder.name) / path.relative_to(folder))
    for name in ['math_parser.py', 'symbolic_solver.py', 'solution_steps.py']:
        archive.write(ROOT / name, name)
    for name in ['sympy', 'mpmath']:
        distribution = importlib.metadata.distribution(name)
        for entry in distribution.files or []:
            if 'license' in str(entry).lower() or str(entry).endswith('METADATA'):
                path = Path(distribution.locate_file(entry))
                if path.is_file():
                    archive.write(path, Path('licenses') / name / path.name)
print('Updated vendor/symbolic-python.zip')
