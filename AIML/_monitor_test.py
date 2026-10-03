import sys, cv2, numpy as np, json, time
sys.path.insert(0, '.')
from proctoring.face_detection import FaceMonitor

T = 'C:/Users/NAGAVI~1/AppData/Local/Temp/opencode/'
img = cv2.imread(T + 'lena.jpg')
h, w = img.shape[:2]

import os
os.environ['VIOLATION_GRACE_SECONDS'] = '0'
os.environ['NO_FACE_CONFIRMATION_FRAMES'] = '3'
os.environ['GAZE_CONFIRMATION_FRAMES'] = '2'
os.environ['HEAD_TURNED_CONFIRMATION_FRAMES'] = '2'
os.environ['EYES_CLOSED_CONFIRMATION_FRAMES'] = '2'
os.environ['NO_FACE_ABSENCE_GRACE_SECONDS'] = '0'

from proctoring.face_detection.violation_manager import ViolationManager  # noqa
from face_detection.inference.landmark_detector import EYE_SIDES

m = FaceMonitor()
print('detector=%s landmarks=%s' % (m.detector.backend_name, m.landmarks.backend_name))

seen = set()
for i in range(12):
    r = m.monitor_frame(img)
    for v in r['violations']:
        if v['type'] not in seen:
            seen.add(v['type'])
            print('VIOLATION', v['type'], '| severity', v.get('severity'), '|', v.get('description'))
    for l in r['info_logs']:
        if l['type'] not in seen:
            seen.add(l['type'])
            print('INFOLOG', l['type'], '|', l.get('message'))
    if i == 0:
        mt = r['metrics']
        print('metrics keys:', sorted(k for k in mt if k != 'landmarks'))
        print('attention=%s gaze=%s/%s head=%s yaw=%s pitch=%s roll=%s' % (
            mt['attention_state'], mt['gaze_horizontal'], mt['gaze_vertical'],
            mt['head_direction'], mt['yaw'], mt['pitch'], mt['roll']))
        print('landmarks_available=%s landmark_count=%s pts_in_payload=%s' % (
            mt['landmarks_available'], mt['landmark_count'], len(mt.get('landmarks', []))))
    if i == 5:
        print('violation_count', r['violation_count'], 'should_auto_submit', r['should_auto_submit'])
    time.sleep(0.05)

print()
print('--- empty frame (no face) ---')
blank = np.zeros((h, w, 3), dtype=np.uint8)
for i in range(4):
    r = m.monitor_frame(blank)
    print('  face_count=%d present=%s attention=%s violations=%s' % (
        r['face_count'], r['face_present'], r['metrics']['attention_state'],
        [v['type'] for v in r['violations']]))

print()
print('--- json serializable ---')
r = m.monitor_frame(img)
s = json.dumps(r)
print('serialized bytes:', len(s))

print()
print('--- state endpoint payload ---')
st = m.get_state()
print(json.dumps({k: v for k, v in st.items() if k != 'violations'}, indent=1))
vs = st['violations']
print('violation_count=%s confirmed=%s info_logs=%s' % (
    vs['violation_count'], len(vs['confirmed']), len(vs['info_logs'])))

print()
print('--- reset ---')
m.reset()
print('after reset, violation_count =', m.violation_manager.get_state()['violation_count'])