from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import request, session, Blueprint
from hashlib import pbkdf2_hmac
from logging import log
from os import environ
from pydantic import BaseModel, ValidationError
from pyotp import TOTP
from secrets import randbelow
from time import sleep
from user_agents import parse

from ..database.classes.user import User
from ..database.main import query_db
from ..util.misc import DATE_FORMAT
from ..util.rand import rand_base64, rand_salt


class RLoginData(BaseModel):
    email: str
    password: str
    totp: str


load_dotenv()


def hash_password(password: str, salt: str):
    return urlsafe_b64encode(pbkdf2_hmac(
        hash_name='sha3_512',
        password=urlsafe_b64decode(environ['HASH_PEPPER_1']) + password.encode() + urlsafe_b64decode(environ['HASH_PEPPER_2']),
        salt=urlsafe_b64decode(salt),
        iterations=int(environ['HASH_ITERATIONS']),
    )).decode()


def is_totp_used(user_id: str, otp: str) -> bool:
    cleanup_expired_totps()
    result = query_db('SELECT otp FROM used_totp WHERE user_id=? AND otp=?', (user_id, otp), True)
    return result is not None


def store_used_totp(user_id: str, otp: str) -> None:
    expiry = (datetime.now() + timedelta(minutes=2)).strftime(DATE_FORMAT)
    query_db('INSERT INTO used_totp (otp, expiry, user_id) VALUES (?, ?, ?)', (otp, expiry, user_id))


def cleanup_expired_totps() -> None:
    now = datetime.now().strftime(DATE_FORMAT)
    query_db('DELETE FROM used_totp WHERE expiry < ?', (now,))


def parse_login_user_agent() -> str:
    ua = parse(request.headers.get('User-Agent', ''))
    os_name = ua.os.family or 'Unknown'
    browser_name = ua.browser.family or 'Unknown'
    return f"{os_name.replace(' ', '')}-{browser_name.replace(' ', '')}"


def get_user_id(no_invalidation=False):
    if 'token' in session:
        db_result = query_db('SELECT id, user_id, created, expires, browser FROM sessions WHERE id=?', (session['token'],), True)
        if db_result:
            if db_result[3] > datetime.now().strftime(DATE_FORMAT):
                if db_result[4] == parse_login_user_agent():
                    if query_db('SELECT id FROM users WHERE id=?', (db_result[1],), True):
                        return db_result[1]
                    elif not no_invalidation:
                        invalidate_session()
                elif not no_invalidation:
                    invalidate_session()
    return None


def create_session(user_id: str):
    session['token'] = rand_base64(64)
    query_db('INSERT INTO sessions (id, user_id, created, expires, browser) VALUES (?, ?, ?, ?, ?)', (session['token'], user_id, datetime.now().strftime(DATE_FORMAT), (datetime.now() + timedelta(days=32)).strftime(DATE_FORMAT), parse_login_user_agent()))


def invalidate_session():
    if 'token' in session:
        query_db('UPDATE sessions SET expires=? WHERE id=?', (datetime.now().strftime(DATE_FORMAT), session['token']))
    session['token'] = ''


login_blueprint = Blueprint('login', __name__)


@login_blueprint.route('/api/v1/login', methods=['POST'])
def r_login():
    try:
        data = dict(request.get_json(silent=True))
    except Exception as e:
        log(20, e)
        return {'error': 'Invalid JSON'}, 400
    try:
        login_data = dict(RLoginData(**data))
    except ValidationError as e:
        log(20, e.errors())
        return {'error': 'Invalid data'}, 400
    user_id: list = query_db('SELECT id FROM users WHERE email=?', (login_data['email'],), True)
    authentication_error = {'error': 'authentication error', 'message': 'Invalid email, password, or TOTP'}, 400
    sleep((randbelow(2 ** 16) / (2 ** 16)) / 7)
    if not user_id:
        return authentication_error
    user_id: str = user_id[0]
    user = User.load(user_id)
    if user.password != hash_password(login_data['password'], user.salt):
        return authentication_error
    if is_totp_used(user_id, login_data['totp']):
        return authentication_error
    totp = TOTP(user.totp)
    totp_valid = totp.verify(login_data['totp'], valid_window=1)
    store_used_totp(user_id, login_data['totp'])
    if not totp_valid:
        return authentication_error
    create_session(user_id)
    user.last_login = datetime.now()
    user.save()
    return {'success': 'success', 'message': 'Successfully signed-in.'}, 200


@login_blueprint.route('/api/v1/logout', methods=['GET', 'POST'])
def r_logout():
    invalidate_session()
    return {'success': 'success', 'message': 'Successfully signed-out.'}, 200


@login_blueprint.route('/api/v1/account', methods=['GET'])
def r_account():
    user_id = get_user_id()
    if not user_id:
        return {'error': 'authentication error', 'message': 'Invalid session.'}, 401
    user = User.load(user_id)
    return {'success': 'success', 'message': 'Successfully retrieved account information.', 'account': user.to_json()}, 200


@login_blueprint.route('/api/v1/hash_password', methods=['POST'])
def r_hash__password():
    try:
        data = dict(request.get_json(silent=True))
    except Exception as e:
        log(20, e)
        return {'error': 'Invalid JSON'}, 400
    password = data.get('password', '')
    if not password:
        return {'error': 'Password is required'}, 400
    salt = rand_salt()
    hashed_password = hash_password(password, salt)
    return {
        'success': 'success',
        'salt': salt,
        'hash': hashed_password
    }, 200
