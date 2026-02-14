from base64 import urlsafe_b64encode
from datetime import datetime
from os import urandom

from ..database.main import query_db
from .misc import DATE_FORMAT


def rand_base64(digits: int) -> str:
    while True:
        n = urlsafe_b64encode(urandom(digits)).decode()[:digits]
        result = query_db('SELECT * FROM used_ids WHERE id=?', (n,), True)
        if not result:
            query_db('INSERT INTO used_ids VALUES (?, ?)', (n, datetime.now().strftime(DATE_FORMAT)))
            return n


def rand_base16(digits: int) -> str:
    while True:
        n = urandom(digits).hex()[:digits]
        result = query_db('SELECT * FROM used_ids WHERE id=?', (n,), True)
        if not result:
            query_db('INSERT INTO used_ids VALUES (?, ?)', (n, datetime.now().strftime(DATE_FORMAT)))
            return n


def rand_salt() -> str:
    return urlsafe_b64encode(urandom(32)).decode()


def rand_id(class_: str, digits: int=16) -> str:
    while True:
        n = f"{class_}#{urlsafe_b64encode(urandom(digits)).decode()[:digits]}"
        result = query_db('SELECT * FROM used_ids WHERE id=?', (n,), True)
        if not result:
            query_db('INSERT INTO used_ids VALUES (?, ?)', (n, datetime.now().strftime(DATE_FORMAT)))
            return n
