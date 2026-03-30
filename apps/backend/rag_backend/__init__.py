"""
VeriRAG Django Application
This module initializes Celery when Django starts.
"""

# Import Celery app so it's loaded when Django starts
#from .celery import app as celery_app

__all__ = ('celery_app',)
