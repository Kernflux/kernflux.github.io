# Draws the link-preview cards (Open Graph / Twitter), 1200x630:
# public/og.png (English) and public/og-zh.png (Chinese).
# Usage: python3 scripts/og-card.py   (needs Pillow and Noto Sans CJK)
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BRAND, INK, MUTED, BG = "#1f4fd8", "#0f172a", "#475569", "#ffffff"
NOTO = "/usr/share/fonts/opentype/noto/NotoSansCJK-{}.ttc"


def font(weight, size):
    # The collection's faces are JP, KR, SC, TC, HK: pick Simplified Chinese.
    for i in range(10):
        f = ImageFont.truetype(NOTO.format(weight), size, index=i)
        if f.getname()[0].endswith(" SC"):
            return f
    raise SystemExit("Noto Sans CJK SC not found")


def logo(d, x, y, s):
    # public/logo.svg, scaled from its 32x32 box
    k = s / 32
    d.rounded_rectangle([x, y, x + s, y + s], radius=6 * k, fill=BRAND)
    for (cx, cy, a) in [(7, 7, 255), (17, 7, 153), (7, 17, 153), (17, 17, 255)]:
        c = (255, 255, 255, a)
        d.rectangle([x + cx * k, y + cy * k, x + (cx + 8) * k, y + (cy + 8) * k], fill=c)


def wrap(d, text, f, width):
    # Breaks at spaces for English, anywhere for Chinese.
    lines, line = [], ""
    tokens = text.split(" ") if " " in text else list(text)
    sep = " " if " " in text else ""
    for t in tokens:
        trial = (line + sep + t) if line else t
        if d.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = t
    return lines + [line]


def card(out, headline, sub, chips):
    im = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 10], fill=BRAND)
    logo(d, 80, 80, 72)
    d.text((176, 84), "OpenDsec", font=font("Bold", 56), fill=INK)
    y = 210
    for line in wrap(d, headline, font("Bold", 54), W - 160):
        d.text((80, y), line, font=font("Bold", 54), fill=INK)
        y += 74
    y += 14
    for line in wrap(d, sub, font("Regular", 30), W - 160):
        d.text((80, y), line, font=font("Regular", 30), fill=MUTED)
        y += 44
    x, f = 80, font("Regular", 26)
    for c in chips:
        w = d.textlength(c, font=f) + 36
        d.rounded_rectangle([x, 520, x + w, 568], radius=24, fill="#e8eefc")
        d.text((x + 18, 527), c, font=f, fill=BRAND)
        x += w + 14
    d.text((W - 80, 590), "kernflux.github.io", font=font("Regular", 22), fill=MUTED, anchor="rs")
    im.convert("RGB").save(out, optimize=True)


card("public/og.png",
     "Open-source sandboxes for RL rollouts and AI agents",
     "Firecracker microVMs, containers and QEMU VMs on your own machines, with an E2B-compatible API.",
     ["~0.1 s microVMs", "fork with memory", "E2B-compatible", "AGPL-3.0"])
card("public/og-zh.png",
     "开源的强化学习与 AI 智能体 sandbox",
     "在自己的机器上运行 microVM、容器和虚拟机，兼容 E2B 的 API。",
     ["约 0.1 秒启动", "连同内存 fork", "兼容 E2B", "AGPL-3.0"])
