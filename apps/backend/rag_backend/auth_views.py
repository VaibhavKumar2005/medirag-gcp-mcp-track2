from rest_framework_simplejwt.views import TokenObtainPairView
from ai_engine.throttles import LoginAnonRateThrottle

class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginAnonRateThrottle]
