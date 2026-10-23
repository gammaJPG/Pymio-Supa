from collections import deque
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "assets" / "pymio-icon.jpeg").convert("RGBA")
width, height = source.size
pixels = source.load()
background = bytearray(width * height)
queue = deque()

def candidate(x, y):
    red, green, blue, _ = pixels[x, y]
    return min(red, green, blue) >= 180 and max(red, green, blue) - min(red, green, blue) <= 90

def add(x, y):
    index = y * width + x
    if not background[index] and candidate(x, y):
        background[index] = 1
        queue.append((x, y))

for x in range(width):
    add(x, 0)
    add(x, height - 1)
for y in range(height):
    add(0, y)
    add(width - 1, y)

while queue:
    x, y = queue.popleft()
    if x: add(x - 1, y)
    if x + 1 < width: add(x + 1, y)
    if y: add(x, y - 1)
    if y + 1 < height: add(x, y + 1)

for y in range(height):
    for x in range(width):
        if background[y * width + x]:
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0)

master = root / "assets" / "pymio-icon-transparent.png"
source.save(master, optimize=True)
for size in (192, 512):
    source.resize((size, size), Image.Resampling.LANCZOS).save(root / f"icon-{size}.png", optimize=True)
