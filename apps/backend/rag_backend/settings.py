"""
Django settings for MediRAG — GCP Cloud Run, Track 2 submission.
"""
import os
import secrets
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# ── 1. Security ──────────────────────────────────────────────────────────────
DEBUG = os.environ.get('DEBUG', 'False').lower() in ('true', '1', 'yes')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY and not DEBUG:
    raise ValueError("DJANGO_SECRET_KEY must be set in production.")
elif not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(50)

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '.a.run.app',
    os.environ.get('CLOUDRUN_SERVICE_URL', '').replace('https://', ''),
]

# ── 2. Application ───────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'ai_engine',
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

# ── 3. Database (PostgreSQL + pgvector) ──────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME':     os.environ.get('POSTGRES_DB',       'medirag_db'),
        'USER':     os.environ.get('POSTGRES_USER',     'admin'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD'),
        'HOST':     os.environ.get('POSTGRES_HOST',     'localhost'),
        'PORT':     os.environ.get('POSTGRES_PORT',     '5432'),
        # Cloud Run: prevent connection pool exhaustion under horizontal scale
        'CONN_MAX_AGE': 0,
    }
}

# ── 4. GCP Configuration ─────────────────────────────────────────────────────
GCP_PROJECT_ID  = os.environ.get('GCP_PROJECT_ID',  '')
GEMINI_MODEL    = os.environ.get('GEMINI_MODEL',    'gemini-1.5-flash')
EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL', 'models/text-embedding-004')

# ── 5. Authentication ────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES':      ('Bearer',),
}

# ── 6. Demo mode ─────────────────────────────────────────────────────────────
# When True, GET /api/demo/token returns a JWT without a password so judges
# can explore the full app without creating an account.
# Set DEMO_MODE=False in production.
DEMO_MODE          = os.environ.get('DEMO_MODE',          'True').lower() in ('true', '1', 'yes')
DEMO_USER_EMAIL    = os.environ.get('DEMO_USER_EMAIL',    'demo@medirag.dev')
DEMO_USER_PASSWORD = os.environ.get('DEMO_USER_PASSWORD', 'MediRAG-Demo-2025!')

# ── 7. Networking ────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = True  # Restrict to FRONTEND_URL in production

CSRF_TRUSTED_ORIGINS = [
    'https://*.a.run.app',
    os.environ.get('FRONTEND_URL', 'http://localhost:5173'),
]

# ── 8. Static & media ────────────────────────────────────────────────────────
STATIC_URL  = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL   = '/media/'
MEDIA_ROOT  = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
