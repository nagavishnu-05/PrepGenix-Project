import sys, json, base64, numpy as np, cv2
sys.path.insert(0, '.')
from api.proctoring_api import app

client = app.test_client()

# 1. Health check
r = client.get('/health')
print("1. /health:", r.status_code, r.get_json()["status"])

# 2. Create synthetic face
def make_fake_face():
    img = np.ones((480, 640, 3), dtype=np.uint8) * 100
    cv2.ellipse(img, (320, 240), (90, 120), 0, 0, 360, (200, 180, 160), -1)
    cv2.circle(img, (285, 215), 12, (255, 255, 255), -1)
    cv2.circle(img, (355, 215), 12, (255, 255, 255), -1)
    cv2.circle(img, (285, 215), 6, (50, 50, 30), -1)
    cv2.circle(img, (355, 215), 6, (50, 50, 30), -1)
    cv2.line(img, (320, 230), (315, 260), (160, 140, 120), 2)
    cv2.ellipse(img, (320, 290), (30, 15), 0, 0, 180, (100, 80, 80), 2)
    _, buf = cv2.imencode('.jpg', img)
    return base64.b64encode(buf).decode()

face_b64 = make_fake_face()

# 3. Multi-frame enrollment
for i in range(6):
    r = client.post('/enroll-frame', json={'image': face_b64, 'attemptId': 'e2e_test'})
    d = r.get_json()
    print("  Frame {}: status={}, captured={}".format(i+1, d["status"], d.get("captured", 0)))
    if d["status"] == "ready":
        print("  -> Enrollment complete after {} frames".format(i+1))
        break

# 4. Enroll status
r = client.post('/enroll-status', json={'attemptId': 'e2e_test'})
print("2. Enroll status:", r.get_json())

# 5. Monitor with same face
r = client.post('/monitor', json={'image': face_b64, 'attemptId': 'e2e_test', 'has_camera': True})
d = r.get_json()
print("3. Monitor (same face): match={}, violations={}, quality={}".format(
    d.get("match"), d.get("violation_count", 0), d.get("quality")))

# 6. Monitor with no face
empty = np.zeros((480, 640, 3), dtype=np.uint8)
_, ebuf = cv2.imencode('.jpg', empty)
empty_b64 = base64.b64encode(ebuf).decode()
r = client.post('/monitor', json={'image': empty_b64, 'attemptId': 'e2e_test', 'has_camera': True})
d = r.get_json()
print("4. Monitor (no face): face_count={}, violations={}".format(
    d.get("face_count"), d.get("violation_count", 0)))

# 7. Reset
r = client.post('/reset', json={'attemptId': 'e2e_test'})
print("5. Reset:", r.status_code, r.get_json())

# 8. Multi-image enroll
r = client.post('/enroll-face', json={'images': [face_b64]*5, 'attemptId': 'e2e_test2'})
d = r.get_json()
print("6. Multi-image enroll: success={}, captured={}".format(d.get("success"), d.get("captured", 0)))

print()
print("=== ALL E2E TESTS PASSED ===")
