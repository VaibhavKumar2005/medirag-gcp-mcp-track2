import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rag_backend.settings')
django.setup()

from django.contrib.auth.models import User

# Check if admin exists
if User.objects.filter(username='admin').exists():
    u = User.objects.get(username='admin')
    print('✅ Admin user exists, updating password...')
else:
    u = User.objects.create_superuser('admin', 'admin@verirag.dev', os.getenv('ADMIN_PASSWORD'))
    print('✅ Admin user created')

u.set_password(os.getenv('ADMIN_PASSWORD'))
u.save()
print('✅ Admin password set securely.')
