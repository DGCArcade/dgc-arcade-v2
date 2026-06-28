#!/usr/bin/env python3
"""Build a labeled contact sheet of all 21 email previews, grouped by category."""
import os
from PIL import Image, ImageDraw, ImageFont

PNG_DIR = "/home/ubuntu/dgc-arcade-v2/email-previews/png"
OUT = "/home/ubuntu/dgc-arcade-v2/email-previews/DGC_Email_Contact_Sheet.png"

categories = [
    ("welcome", "1 — WELCOME / NEW SIGN-UP"),
    ("verification", "2 — EMAIL VERIFICATION"),
    ("login-security", "3 — LOGIN SECURITY ALERT"),
    ("deposit", "4 — DEPOSIT CONFIRMED"),
    ("withdrawal", "5 — WITHDRAWAL PROCESSED"),
    ("password-reset", "6 — PASSWORD RESET"),
    ("suspicious", "7 — SUSPICIOUS ACTIVITY"),
]

def crop_content(img, bg_thresh=12):
    """Crop away the empty black space at the bottom of each shot."""
    gray = img.convert("L")
    w, h = gray.size
    px = gray.load()
    last = h - 1
    for y in range(h - 1, -1, -1):
        rowmax = max(px[x, y] for x in range(0, w, 9))
        if rowmax > bg_thresh:
            last = y
            break
    return img.crop((0, 0, w, min(h, last + 24)))

def load_font(size):
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

THUMB_W = 300
LABEL_H = 34
CAT_H = 44
PAD = 18
COLS = 3

font_lbl = load_font(15)
font_cat = load_font(20)

# Pre-crop all thumbs
thumbs = {}
maxthumb_h = 0
for key, _ in categories:
    for v in (1, 2, 3):
        f = os.path.join(PNG_DIR, f"{key}_v{v}.png")
        img = crop_content(Image.open(f).convert("RGB"))
        ratio = THUMB_W / img.width
        img = img.resize((THUMB_W, int(img.height * ratio)), Image.LANCZOS)
        thumbs[(key, v)] = img
        maxthumb_h = max(maxthumb_h, img.height)

row_h = CAT_H + LABEL_H + maxthumb_h + PAD
sheet_w = COLS * THUMB_W + (COLS + 1) * PAD
sheet_h = len(categories) * row_h + PAD

sheet = Image.new("RGB", (sheet_w, sheet_h), (5, 5, 7))
draw = ImageDraw.Draw(sheet)

subjects = {
    ("welcome",1):"V1 Neon — Welcome to the floor",
    ("welcome",2):"V2 Gold — The Streets Always Win",
    ("welcome",3):"V3 Cyber — Player One Ready",
    ("verification",1):"V1 Cyber — Activation Key",
    ("verification",2):"V2 Gold — Verify Your Email",
    ("verification",3):"V3 Ocean — Unlock Withdrawals",
    ("login-security",1):"V1 Purple — Access Event",
    ("login-security",2):"V2 Blood — New Login Detected",
    ("login-security",3):"V3 Gold — New Sign-In",
    ("deposit",1):"V1 Neon — Bag Secured",
    ("deposit",2):"V2 Cyber — Funds Loaded",
    ("deposit",3):"V3 Gold — Deposit Confirmed",
    ("withdrawal",1):"V1 Gold — Withdrawal Processed",
    ("withdrawal",2):"V2 Ocean — Cashout Sent",
    ("withdrawal",3):"V3 Cyber — Payout Confirmed",
    ("password-reset",1):"V1 Gold — Reset Your Password",
    ("password-reset",2):"V2 Volcanic — Lock Back In",
    ("password-reset",3):"V3 Purple — Reset Request",
    ("suspicious",1):"V1 Blood — Suspicious Activity",
    ("suspicious",2):"V2 Volcanic — We Caught Something",
    ("suspicious",3):"V3 Purple — Security Notice",
}

y = PAD
for key, cat_label in categories:
    draw.text((PAD, y + 8), cat_label, font=font_cat, fill=(255, 215, 0))
    yy = y + CAT_H
    for i, v in enumerate((1, 2, 3)):
        x = PAD + i * (THUMB_W + PAD)
        sub = subjects.get((key, v), f"V{v}")
        draw.text((x, yy + 6), sub, font=font_lbl, fill=(200, 200, 210))
        sheet.paste(thumbs[(key, v)], (x, yy + LABEL_H))
    y += row_h

sheet.save(OUT, "PNG", optimize=True)
print("Saved:", OUT, sheet.size)
