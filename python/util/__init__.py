from dotenv import load_dotenv
from os import environ

from .logger import *


__all__ = [
    'DATE_FORMAT',
    'DEVELOPMENT',
    'setup_logger',
    'LOG_INFO',
    'GetLogger',
    'LogFormatter',
    'LogFileHandler',
    'LogBasicConfig',
]


load_dotenv()
DATE_FORMAT = '%Y-%m-%d_%H-%M-%S'
DEVELOPMENT = environ.get('ENVIRONMENT', '') == 'dev'
