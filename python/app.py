from datetime import timedelta
from dotenv import load_dotenv
from flask import Flask, request, Response, send_from_directory
from os import urandom
from os.path import exists, join
from requests import request as requests_send

from util import *
from database import *


load_dotenv()

app = Flask(__name__)

if not exists(join(app.root_path, 'key.bin')):
    with open(join(app.root_path, 'key.bin'), 'wb') as _f:
        _f.write(urandom(64))
with open(join(app.root_path, 'key.bin'), 'rb') as _f:
    _secret_key = _f.read()
app.secret_key = _secret_key

if DEVELOPMENT:
    app.config.update(
        SESSION_COOKIE_NAME='session',
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=False,
        SESSION_COOKIE_SAMESITE='Strict',
        PERMANENT_SESSION_LIFETIME=timedelta(days=128),
    )
else:
    app.config.update(
        SESSION_COOKIE_NAME='__Host-session',
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_SAMESITE='Strict',
        PERMANENT_SESSION_LIFETIME=timedelta(days=128),
    )

LogBasicConfig(filename='main.log', format='%(asctime)s\t%(message)s', datefmt=DATE_FORMAT, level=LOG_INFO)

setup_logger('access', join(app.root_path, 'logs', 'access.log'))
setup_logger('debug', join(app.root_path, 'logs', 'debug.log'))
access_log = GetLogger('access')

database_init(app)


@app.errorhandler(404)
def error_handler_404(*_, **__):
    if DEVELOPMENT:
        res = requests_send(
            method=request.method,
            url='http://' + request.url.replace(request.host_url, 'localhost:4200/'),  # noqa
            headers={k: v for k, v in request.headers if k.lower() != 'host'},
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=True,
        )
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = [
            (k, v) for k, v in res.raw.headers.items()
            if k.lower() not in excluded_headers
        ]
        response = Response(res.content, res.status_code, headers)  # noqa
        return response
    else:
        path = request.path
        if path and path.startswith('/'):
            path = path[1:]
        if path != '' and exists(join(app.root_path, 'web', path)):
            return send_from_directory(join(app.root_path, 'web'), path), 200
        else:
            return send_from_directory(join(app.root_path, 'web'), 'index.html'), 200


if __name__ == '__main__':
    app.run('0.0.0.0', port=5000, debug=False)
