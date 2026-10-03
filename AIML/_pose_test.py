"""Validate head-pose angles by applying known transforms to the image.

Each case warps a real photo and re-runs the full detector, so it exercises the
same path used at runtime rather than feeding synthetic landmarks.
"""
import sys, math
sys.path.insert(0, '.')
import cv2, numpy as np
from face_detection.inference.landmark_detector import FacialLandmarkDetector
from face_detection.inference.head_pose import HeadPoseEstimator

T = 'C:/Users/NAGAVI~1/AppData/Local/Temp/opencode/'
d = FacialLandmarkDetector()
hp = HeadPoseEstimator()

failures = []


def pose_of(img, label):
    faces = d.detect(img, 1000)['faces']
    if not faces:
        failures.append('%s: no face detected' % label)
        print('RES %-24s no face' % label)
        return None
    p = hp.estimate(faces[0]['landmarks'], img.shape[:2])
    if p is None:
        failures.append('%s: estimate returned None' % label)
        print('RES %-24s estimate None' % label)
        return None
    print('RES %-24s yaw=%+7.2f pitch=%+7.2f roll=%+7.2f dir=%-6s conf=%.2f'
          % (label, p.yaw, p.pitch, p.roll, p.direction, p.confidence))
    return p


def rotated(img, deg):
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR)


def scaled(img, f):
    return cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_LINEAR)


def shifted(img, dx, dy):
    h, w = img.shape[:2]
    m = np.array([[1, 0, dx], [0, 1, dy]], dtype=np.float64)
    return cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE)


lena = cv2.imread(T + 'lena.jpg')
print('RES === baseline ===')
base = pose_of(lena, 'baseline')
if base is None:
    raise SystemExit('baseline pose unavailable')

print('RES === roll tracks image rotation within 4 deg ===')
for deg in (-25, -15, 15, 25):
    p = pose_of(rotated(lena, deg), 'rotate %+d' % deg)
    if p is None:
        continue
    err = abs(p.roll - deg)
    status = 'ok' if err <= 4.0 else 'FAIL'
    if err > 4.0:
        failures.append('roll %+d: off by %.1f' % (deg, err))
    print('RES   -> roll %+.2f vs expected %+d, off by %.2f (%s)'
          % (p.roll, deg, err, status))

print('RES === mirroring flips yaw sign ===')
mir = pose_of(cv2.flip(lena, 1), 'mirrored')
if mir is not None:
    ok = (base.yaw > 0) != (mir.yaw > 0)
    if not ok:
        failures.append('mirror did not flip yaw sign')
    print('RES   -> yaw %+.2f -> %+.2f, sign flipped: %s'
          % (base.yaw, mir.yaw, ok))

print('RES === scale invariant within 4 deg ===')
for f in (0.5, 0.75, 1.5):
    p = pose_of(scaled(lena, f), 'scale %.2f' % f)
    if p is None:
        continue
    err = max(abs(p.yaw - base.yaw), abs(p.pitch - base.pitch), abs(p.roll - base.roll))
    status = 'ok' if err <= 4.0 else 'FAIL'
    if err > 4.0:
        failures.append('scale %.2f: angles moved %.1f deg' % (f, err))
    print('RES   -> max angle change %.2f (%s)' % (err, status))

print('RES === translation invariant within 4 deg ===')
for dx, dy in ((40, 0), (-40, 25), (60, -30)):
    p = pose_of(shifted(lena, dx, dy), 'shift %+d%+d' % (dx, dy))
    if p is None:
        continue
    err = max(abs(p.yaw - base.yaw), abs(p.pitch - base.pitch), abs(p.roll - base.roll))
    status = 'ok' if err <= 4.0 else 'FAIL'
    if err > 4.0:
        failures.append('shift %+d%+d: angles moved %.1f deg' % (dx, dy, err))
    print('RES   -> max angle change %.2f (%s)' % (err, status))

print('RES === normalized landmark input matches pixel input ===')
faces = d.detect(lena, 1000)['faces']
h, w = lena.shape[:2]
pix = hp.estimate(faces[0]['landmarks'], (h, w))
norm_lm = [[v[0] / w, v[1] / h, v[2] / w] for v in faces[0]['landmarks']]
nrm = hp.estimate(norm_lm, (h, w), normalized=True)
if pix is None or nrm is None:
    failures.append('normalized-input comparison unavailable')
else:
    err = max(abs(pix.yaw - nrm.yaw), abs(pix.pitch - nrm.pitch), abs(pix.roll - nrm.roll))
    status = 'ok' if err <= 1.0 else 'FAIL'
    if err > 1.0:
        failures.append('normalized input differs by %.2f deg' % err)
    print('RES pixel yaw=%+.2f pitch=%+.2f roll=%+.2f' % (pix.yaw, pix.pitch, pix.roll))
    print('RES norm yaw=%+.2f pitch=%+.2f roll=%+.2f  diff %.2f (%s)'
          % (nrm.yaw, nrm.pitch, nrm.roll, err, status))

print('RES === a frontal face is not reported as turned ===')
ok = not base.is_turning and not base.is_tilted
if not ok:
    failures.append('frontal face flagged as turning/tilted')
print('RES is_turning=%s is_tilted=%s (%s)' % (base.is_turning, base.is_tilted,
                                               'ok' if ok else 'FAIL'))

print('')
if failures:
    print('RES FAILURES (%d):' % len(failures))
    for f in failures:
        print('  - %s' % f)
    raise SystemExit(1)
print('RES ALL CHECKS PASSED')