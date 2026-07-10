from pathlib import Path
from shutil import copy, rmtree
from subprocess import run
from time import sleep


EXCLUSIONS = [
    'database.sqlite',
    'static_content/',
    'logs/',
    '.log',
    'key.bin',
    'web/',
    '.git/',
    '__pycache__',
    'admins.txt',
    '.env',
]


def main():
    rmtree('build', ignore_errors=True)
    Path('build').mkdir(parents=True, exist_ok=True)
    for file_path in Path('python').rglob('*'):
        for exclusion in EXCLUSIONS:
            if exclusion in str(file_path):
                break
        else:
            if file_path.is_dir():
                Path('build').joinpath(file_path.relative_to('python')).mkdir(parents=True, exist_ok=True)
            if file_path.is_file():
                Path('build').joinpath(file_path.relative_to('python')).parent.mkdir(parents=True, exist_ok=True)
                copy(file_path, Path('build').joinpath(file_path.relative_to('python')))
    rmtree('angular/posteacloud/dist', ignore_errors=True)
    run(['npx', 'ng', 'build', '--configuration', 'production'], cwd=Path('angular/posteacloud').absolute(), check=True, stdout=None)
    sleep(1)
    Path('build/web').mkdir(parents=True, exist_ok=True)
    for file_path in Path('angular/posteacloud/dist/posteacloud/browser').rglob('*'):
        if file_path.is_dir():
            Path('build/web').joinpath(file_path.relative_to('angular/posteacloud/dist/posteacloud/browser')).mkdir(parents=True, exist_ok=True)
        if file_path.is_file():
            Path('build/web').joinpath(file_path.relative_to('angular/posteacloud/dist/posteacloud/browser')).parent.mkdir(parents=True, exist_ok=True)
            copy(file_path, Path('build/web').joinpath(file_path.relative_to('angular/posteacloud/dist/posteacloud/browser')))


if __name__ == '__main__':
    main()
