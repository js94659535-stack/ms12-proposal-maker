# 가상 예시본의 지역 교육복지 자원지도 개략도. 실제 지도가 아니며 거리·방향은 본문 4-1 표의 도보·버스 시간을 따른다.
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
W, H = 1500, 560
img = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(img)
f = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 26)
fb = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 28)
fs = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 22)
d.rectangle([4, 4, W - 5, H - 5], outline='#555', width=3)
cx, cy = 750, 270
nodes = [
    ('우산청소년문화의집', '참여기관 · 도보 12분', 250, 120, '#dbeafe'),
    ('신창고등학교', '참여기관 · 도보 15분', 1250, 120, '#dbeafe'),
    ('청소년상담복지센터', '도보 10분', 250, 420, '#fef3c7'),
    ('Wee센터', '버스 20분', 750, 480, '#fef3c7'),
    ('빛고을전문대학', '학과 체험 · 버스 25분', 1250, 420, '#dcfce7'),
    ('지역 사업장 4곳', '일터 체험 · 버스 15~30분', 1250, 270, '#dcfce7'),
]
for name, note, x, y, col in nodes:
    d.line([(cx, cy), (x, y)], fill='#888', width=3)
for name, note, x, y, col in nodes:
    d.rounded_rectangle([x - 190, y - 45, x + 190, y + 45], 14, fill=col, outline='#555', width=2)
    d.text((x, y - 16), name, font=f, fill='black', anchor='mm')
    d.text((x, y + 22), note, font=fs, fill='#333', anchor='mm')
d.rounded_rectangle([cx - 190, cy - 50, cx + 190, cy + 50], 14, fill='#fecaca', outline='#222', width=3)
d.text((cx, cy - 14), '빛고을청소년성장센터', font=fb, fill='black', anchor='mm')
d.text((cx, cy + 24), '대표기관 · 월곡동(기준점)', font=fs, fill='#333', anchor='mm')
d.text((W - 20, H - 20), '가상 예시 개략도 — 실제 지도가 아님, 제출 전 실제 지도로 교체', font=fs, fill='#b91c1c', anchor='rd')
img.save(out)
