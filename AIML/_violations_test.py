import os
os.environ['VIOLATION_GRACE_SECONDS'] = '0'
os.environ['NO_FACE_CONFIRMATION_FRAMES'] = '3'
os.environ['MULTIPLE_FACE_CONFIRMATION_FRAMES'] = '2'
os.environ['GAZE_CONFIRMATION_FRAMES'] = '2'
os.environ['HEAD_TURNED_CONFIRMATION_FRAMES'] = '2'
os.environ['EYES_CLOSED_CONFIRMATION_FRAMES'] = '2'
os.environ['NO_FACE_ABSENCE_GRACE_SECONDS'] = '0'
os.environ['BLINK_EYES_CLOSED_SECONDS'] = '0.0'
os.environ['BLINK_EAR_CLOSED_THRESHOLD'] = '0.30'
os.environ['BLINK_EAR_OPEN_THRESHOLD'] = '0.35'

import sys, cv2, numpy as np, time
sys.path.insert(0, '.')

from proctoring.face_detection import FaceMonitor
from face_detection.inference.landmark_detector import EYE_SIDES

T = 'C:/Users/NAGAVI~1/AppData/Local/Temp/opencode/'
img = cv2.imread(T + 'lena.jpg')
blank = np.zeros(img.shape, dtype=np.uint8)

def run(name, frames, mutate=None):
    m = FaceMonitor()
    fired = []
    logged = []
    for i, f in enumerate(frames):
        ff = f
        if mutate:
            ff = mutate(f)
        r = m.monitor_frame(ff)
        for v in r['violations']:
            fired.append((v['type'], v.get('severity')))
        for l in r['info_logs']:
            logged.append(l['type'])
        time.sleep(0.02)
    print('%-28s violations=%s info=%s count=%d' % (
        name, sorted(set(fired)), sorted(set(logged)), m.violation_manager.get_state()['violation_count']))
    return fired


run('no-face x6', [blank] * 6)
run('frontal x6', [img] * 6)

# two faces: paste a second copy beside the original
two = np.hstack([img, cv2.flip(img, 1)])
run('two faces x6', [two] * 6)

# eyes closed: collapse the eye rings vertically
def closed(f):
    b = [list(p) for p in _LAST[0]]
    return b


def make_collapsed(f):
    return f


m = FaceMonitor()
r = m.monitor_frame(img)
pts = [list(p) for p in r['metrics'].get('landmarks', [])]
if pts:
    pts_norm = [[p[0] / img.shape[1], p[1] / img.shape[0], 0.0] for p in pts]
    for side in ('left', 'right'):
        spec = EYE_SIDES[side]
        ring = spec['ring']
        ys = [pts_norm[i][1] for i in ring]
        cy = sum(ys) / len(ys)
        for i in ring:
            pts_norm[i][1] = cy + (pts_norm[i][1] - cy) * 0.05
    for i, p in enumerate(pts_norm):
        pts_norm[i] = [p[0], p[1], 0.0]
    # build a frame-independent path by feeding landmarks directly
    print('collapsed EAR left = %.4f' % m.blink._ear(pts_norm, EYE_SIDES['left']['six']))
    print('collapsed EAR right= %.4f' % m.blink._ear(pts_norm, EYE_SIDES['right']['six']))

print()
print('--- prolonged closure over time (direct landmark feed) ---')
m2 = FaceMonitor()
t = time.time()
for i in range(10):
    bm = m2.blink.update(pts_norm, t + i * 0.5)
    print('  t=%.1f eyes_closed=%s dur=%.2f prolonged=%s' % (
        i * 0.5, bm.eyes_closed, bm.eyes_closed_duration, bm.prolonged_closure))