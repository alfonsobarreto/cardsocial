import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "app" / "(tabs)" / "contacts.tsx"
text = path.read_text(encoding="utf-8")
m = re.search(r"const styles = StyleSheet\.create\(\{", text)
if not m:
    raise SystemExit("no StyleSheet match")
start_brace = text.index("{", m.start())
depth = 0
i = start_brace
while i < len(text):
    c = text[i]
    if c == "{":
        depth += 1
    elif c == "}":
        depth -= 1
        if depth == 0:
            body_end = i
            break
    i += 1
body = text[start_brace : body_end + 1]

rep = [
    ("'#0D4D8A'", "shell.textPrimary"),
    ("'#0A2540'", "shell.textPrimary"),
    ("'#0A1A2F'", "shell.btnPrimaryText"),
    ("'#54C1FB'", "shell.refreshAccent"),
    ("'#FFFFFF'", "shell.surface"),
    ("'#FFF'", "shell.surface"),
    ("'#B8E7FF'", "shell.border"),
    ("'#EAF7FF'", "shell.surfaceMuted"),
    ("'#F2FBFF'", "shell.surfaceMuted"),
    ("'#F8FCFF'", "shell.surfaceMuted"),
    ("'#D0EEFF'", "shell.border"),
    ("'#CFEFFF'", "shell.border"),
    ("'#BFDFF4'", "shell.border"),
    ("'#CFE8F7'", "shell.border"),
    ("'#D6EBF8'", "shell.border"),
    ("'#D6F2FF'", "shell.border"),
    ("'#CDEFFF'", "shell.border"),
    ("'#C7E8FF'", "shell.border"),
    ("'#D5EAF7'", "shell.border"),
    ("'#AFCFE6'", "shell.border"),
    ("'#C3E6FA'", "shell.border"),
    ("'#A4CAE8'", "shell.border"),
    ("'#EAF4FF'", "shell.surfaceMuted"),
    ("'#DCEFFF'", "shell.surfaceMuted"),
    ("'#E5F2FA'", "shell.surfaceMuted"),
    ("'#F5FCFF'", "shell.surfaceMuted"),
    ("'#EFFFF5'", "shell.storiesNormalBtnBg"),
    ("'#B9EFD0'", "shell.storiesNormalBtnBorder"),
    ("'#C5A065'", "shell.ctaAccent"),
    ("'#1E66A3'", "shell.refreshAccent"),
    ("'#2A668F'", "shell.textSecondary"),
    ("'#2E668C'", "shell.textSecondary"),
    ("'#2F648A'", "shell.textSecondary"),
    ("'#3D6F92'", "shell.textSecondary"),
    ("'#3E7395'", "shell.textSecondary"),
    ("'#3A7093'", "shell.textSecondary"),
    ("'#346B8E'", "shell.textSecondary"),
    ("'#3F7193'", "shell.textSecondary"),
    ("'#407797'", "shell.textSecondary"),
    ("'#4C7C9D'", "shell.textSecondary"),
    ("'#4E7E9F'", "shell.textSecondary"),
    ("'#4F7D9B'", "shell.textSecondary"),
    ("'#4F7B9A'", "shell.textSecondary"),
    ("'#5A87A6'", "shell.textSecondary"),
    ("'#5A7A90'", "shell.textSecondary"),
    ("'#5B809D'", "shell.textSecondary"),
    ("'#9A6B1A'", "shell.ctaAccentPressed"),
    ("'#4A4A4A'", "shell.textMuted"),
    ("'#B7343A'", "shell.danger"),
    ("'#FF2638'", "shell.danger"),
    ("'#FF3B30'", "shell.danger"),
    ("'#00C86F'", "shell.success"),
    ("'#1A2332'", "shell.modalBg"),
    ("'#000000'", "shell.subtleShadow"),
    ("'#000'", "shell.subtleShadow"),
    ("'#9EABBA'", "shell.textMuted"),
    ("'#66C7FF'", "shell.refreshAccent"),
    ("'#E8C547'", "shell.ctaAccent"),
    ("'#F4E8D4'", "shell.typeBadgeBg"),
    ("'#E9D8B0'", "shell.typeBadgeText"),
    ("'#F7E7C6'", "shell.typeBadgeBg"),
    ("'#FFF2F3'", "shell.dangerBannerBg"),
    ("'#E5A4A8'", "shell.dangerBannerBorder"),
    ("'#AF2830'", "shell.danger"),
    ("'#C44B55'", "shell.danger"),
    ("'#497499'", "shell.textSecondary"),
    ("'#406B8A'", "shell.textSecondary"),
    ("'#3D6C8D'", "shell.textSecondary"),
    ("'#4B7395'", "shell.textSecondary"),
    ("'#4A7392'", "shell.textSecondary"),
    ("'#3E6787'", "shell.textSecondary"),
    ("'#244A66'", "shell.textSecondary"),
    ("'#2F5A78'", "shell.textSecondary"),
    ("'#D4AF37'", "shell.ctaAccent"),
]
out = body
for a, b in rep:
    out = out.replace(a, b)

out = re.sub(r"'rgba\(13,77,138,[^']+\)'", "shell.border", out)
out = re.sub(r"'rgba\(255,255,255,[^']+\)'", "shell.surfaceMuted", out)
out = re.sub(r"'rgba\(10,37,64,[^']+\)'", "shell.overlayScrim", out)
out = re.sub(r"'rgba\(0, 0, 0,[^']+\)'", "shell.subtleShadow", out)

header = """import { Platform, StyleSheet } from \"react-native\";
import type { AppShellTheme } from \"../theme\";

export function makeContactsStyles(shell: AppShellTheme) {
  return StyleSheet.create("""
footer = """);
}
"""
out_path = root / "app" / "(tabs)" / "_contacts.styles.ts"
out_path.write_text(header + out + footer, encoding="utf-8")
print("written", out_path, "chars", len(out))
