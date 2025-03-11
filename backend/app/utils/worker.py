from app.utils.celery_config import celery_app
import app.utils.tasks 

if __name__ == '__main__':
    celery_app.worker_main(['worker', '--loglevel=info'])