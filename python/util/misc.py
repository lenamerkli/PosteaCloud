from dotenv import load_dotenv
from os import environ


__all__ = [
    'DATE_FORMAT',
    'DEVELOPMENT',
]

load_dotenv()
DATE_FORMAT = '%Y-%m-%d_%H-%M-%S'
DEVELOPMENT = environ.get('ENVIRONMENT', '') == 'dev'
