# -*- coding: utf-8 -*-
"""生成应用图标：assets/icon.png + assets/icon.ico（256x256）"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUT, exist_ok=True)

SIZE = 256


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # 渐变底（圆角蓝）
    grad = Image.new("RGBA", (SIZE, SIZE))
    top = (96, 190, 255)
    bottom = (0, 110, 220)
    for y in range(SIZE):
        color = lerp(top, bottom, y / (SIZE - 1))
        ImageDraw.Draw(grad).line([(0, y), (SIZE, y)], fill=color + (255,))
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=56, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # 白色对话气泡
    d.rounded_rectangle([48, 52, 208, 168], radius=34, fill=(255, 255, 255, 255))
    d.polygon([(96, 166), (128, 200), (150, 166)], fill=(255, 255, 255, 255))
    # 气泡里的 Q
    font = None
    for candidate in [
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]:
        if os.path.exists(candidate):
            try:
                font = ImageFont.truetype(candidate, 96)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()

    bbox = d.textbbox((0, 0), "Q", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((128 - tw / 2 - bbox[0], 108 - th / 2 - bbox[1]), "Q", font=font, fill=(0, 120, 230))

    img.save(os.path.join(OUT, "icon.png"), "PNG")
    img.save(
        os.path.join(OUT, "icon.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("icon written")


if __name__ == "__main__":
    make_icon()
