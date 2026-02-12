from logging import INFO, getLogger as GetLogger, Formatter as LogFormatter, FileHandler as LogFileHandler, basicConfig as LogBasicConfig


LOG_INFO = INFO


__all__ = [
    'setup_logger',
    'LOG_INFO',
    'GetLogger',
    'LogFormatter',
    'LogFileHandler',
    'LogBasicConfig',
]

def setup_logger(name, file):
    """
    Creates a new logging instance
    :param name: the name
    :param file: path to the file to which the contents will be written
    :return:
    """
    logger = GetLogger(name)
    formatter = LogFormatter('%(asctime)s\t%(message)s', datefmt='%Y-%m-%d_%H-%M-%S')
    file_handler = LogFileHandler(file, mode='a')
    file_handler.setFormatter(formatter)
    logger.setLevel(LOG_INFO)
    logger.addHandler(file_handler)
    logger.propagate = False
