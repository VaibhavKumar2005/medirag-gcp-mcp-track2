from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DocumentViewSet,
    query_llm,
    SystemInsightsView,
    process_document,
    health_check,
    health_check_details,
    demo_token,
    demo_seed,
)
from .ops_views import (
    cost_metrics_today, cost_metrics_week, budget_alert,
    quality_metrics_week, quality_metrics_month, ops_dashboard,
    prompt_versions, prompt_active, prompt_promote,
    prompt_ab_tests, prompt_ab_results,
    eval_datasets, eval_runs, eval_run_summary,
    drift_summary, drift_alerts, drift_acknowledge_alert,
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    path('', include(router.urls)),
    path('query/',            query_llm,               name='query_llm'),
    path('process-document/', process_document,         name='process_document'),
    path('system-insights/',  SystemInsightsView.as_view(), name='system-insights'),
    path('health/',           health_check,            name='health'),
    path('health/details/',   health_check_details,    name='health-details'),

    # ── Demo mode (judges) ────────────────────────────────────────────────
    path('demo/token/',  demo_token, name='demo_token'),
    path('demo/seed/',   demo_seed,  name='demo_seed'),

    # ── Ops endpoints ────────────────────────────────────────────────────
    path('ops/dashboard/',          ops_dashboard,       name='ops_dashboard'),
    path('ops/cost/today/',         cost_metrics_today,  name='cost_metrics_today'),
    path('ops/cost/week/',          cost_metrics_week,   name='cost_metrics_week'),
    path('ops/cost/budget-alert/',  budget_alert,        name='budget_alert'),
    path('ops/quality/week/',       quality_metrics_week,  name='quality_metrics_week'),
    path('ops/quality/month/',      quality_metrics_month, name='quality_metrics_month'),

    # ── PromptOps ────────────────────────────────────────────────────────
    path('ops/prompt/versions/<str:prompt_name>/',              prompt_versions,  name='prompt_versions'),
    path('ops/prompt/active/<str:prompt_name>/',                prompt_active,    name='prompt_active'),
    path('ops/prompt/promote/',                                 prompt_promote,   name='prompt_promote'),
    path('ops/prompt/ab-tests/',                                prompt_ab_tests,  name='prompt_ab_tests'),
    path('ops/prompt/ab-tests/<str:test_id>/results/',          prompt_ab_results, name='prompt_ab_results'),

    # ── EvalOps ──────────────────────────────────────────────────────────
    path('ops/eval/datasets/',                      eval_datasets,    name='eval_datasets'),
    path('ops/eval/runs/',                          eval_runs,        name='eval_runs'),
    path('ops/eval/runs/<str:run_id>/summary/',     eval_run_summary, name='eval_run_summary'),

    # ── DriftOps ─────────────────────────────────────────────────────────
    path('ops/drift/summary/',                                  drift_summary,           name='drift_summary'),
    path('ops/drift/alerts/',                                   drift_alerts,            name='drift_alerts'),
    path('ops/drift/alerts/<str:alert_id>/acknowledge/',        drift_acknowledge_alert, name='drift_acknowledge_alert'),
]
