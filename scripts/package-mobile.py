"""Create a static-only publish folder and ZIP, with no private runtime data."""
from pathlib import Path
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / 'formula-mobile'
FILES = ['index.html', 'style.css', 'app.js', 'engine.js', 'solver.html', 'solver.css', 'solver.js', 'browser-solver.js', 'symbolic-worker.mjs', 'edgeone.json']
OUTPUT.mkdir(parents=True, exist_ok=True)
for name in FILES:
    shutil.copy2(ROOT / name, OUTPUT / name)
for name in ['katex', 'pyodide']:
    shutil.copytree(ROOT / 'vendor' / name, OUTPUT / 'vendor' / name, dirs_exist_ok=True)
shutil.copy2(ROOT / 'vendor/symbolic-python.zip', OUTPUT / 'vendor/symbolic-python.zip')
archive_path = ROOT.parent / 'formula-mobile-publish.zip'
with ZipFile(archive_path, 'w', ZIP_DEFLATED) as archive:
    for path in OUTPUT.rglob('*'):
        if path.is_file():
            archive.write(path, path.relative_to(OUTPUT))
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    assert 'index.html' in archive.namelist()
    assert 'server.py' not in archive.namelist()
    print('Publish ZIP verified:', archive_path, archive_path.stat().st_size, 'bytes')
