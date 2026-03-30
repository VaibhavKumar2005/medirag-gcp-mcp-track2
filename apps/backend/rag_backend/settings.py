import os, secrets
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG      = os.environ.get('DEBUG', 'False').lower() in ('true', '1', 'yes')
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or secrets.token_urlsafe(50)

ALLOWED_HOSTS = [
    'localhost', '127.0.0.1', '0.0.0.0', '.a.run.app',
    os.environ.get('CLOUDRUN_SERVICE_URL', '').replace('https://', ''),
]

INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'corsheaders', 'rest_framework', 'rest_framework_simplejwt', 'ai_engine',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'rag_backend.urls'
WSGI_APPLICATION = 'rag_backend.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.postgresql',
        'NAME':     os.environ.get('POSTGRES_DB',       'medirag_db'),
        'USER':     os.environ.get('POSTGRES_USER',     'admin'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'devpassword'),
        'HOST':     os.environ.get('POSTGRES_HOST',     'localhost'),
        'PORT':     os.environ.get('POSTGRES_PORT',     '5432'),
        'CONN_MAX_AGE': 0,
    }
}

GCP_PROJECT_ID  = os.environ.get('GCP_PROJECT_ID', '')
GEMINI_MODEL    = os.environ.get('GEMINI_MODEL',    'gemini-1.5-flash')
EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL', 'models/text-embedding-004')

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ('rest_framework_simplejwt.authentication.JWTAuthentication',),
    'DEFAULT_PERMISSION_CLASSES': ('rest_framework.permissions.IsAuthenticated',),
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {
        'login': '20/hour', 'query': '60/hour', 'upload': '20/hour',
        'document_action': '30/hour', 'anon': '100/day', 'user': '1000/day',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=4),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

DEMO_MODE          = os.environ.get('DEMO_MODE', 'True').lower() in ('true', '1', 'yes')
DEMO_USER_EMAIL    = os.environ.get('DEMO_USER_EMAIL',    'demo@medirag.dev')
DEMO_USER_PASSWORD = os.environ.get('DEMO_USER_PASSWORD', 'MediRAG-Demo-2025!')

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
CORS_ALLOWED_ORIGINS = list(filter(None, [
    'http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080', FRONTEND_URL,
]))
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = DEBUG
CSRF_TRUSTED_ORIGINS = ['https://*.a.run.app', FRONTEND_URL]

STATIC_URL  = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL   = '/media/'
MEDIA_ROOT  = os.path.join(BASE_DIR, 'media')
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGGING = {
    'version': 1, 'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}

CELERY_BROKER_URL = 'redis://redis:6379/0'  # or your broker URL
CELERY_RESULT_BACKEND = 'redis://redis:6379/0'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'