from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DocumentViewSet, query_llm, SystemInsightsView,
    process_document, health_check, health_check_details, demo_token, demo_seed,
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    path('', include(router.urls)),
    path('query/',            query_llm,                    name='query_llm'),
    path('process-document/', process_document,             name='process_document'),
    path('system-insights/',  SystemInsightsView.as_view(), name='system-insights'),
    path('health/',           health_check,                 name='health'),
    path('health/details/',   health_check_details,         name='health-details'),
    path('demo/token/',       demo_token,                   name='demo_token'),
    path('demo/seed/',        demo_seed,                    name='demo_seed'),
]
