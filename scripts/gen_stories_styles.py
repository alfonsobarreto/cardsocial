"""One-off generator: extract StyleSheet from stories.tsx → stories.styles.ts (run while StyleSheet still in file)."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "app" / "(tabs)" / "stories.tsx"
text = path.read_text(encoding="utf-8")
m = re.search(r"const styles = StyleSheet\.create\(\{", text)
if not m:
    raise SystemExit("no StyleSheet match in stories.tsx")
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
    ("'#FFFFFF'", "shell.fabText"),
    ("'#FFF'", "shell.fabText"),
    ("'#B8E7FF'", "shell.border"),
    ("'#EAF7FF'", "shell.surfaceMuted"),
    ("'#F2FBFF'", "shell.surfaceMuted"),
    ("'#F5FCFF'", "shell.surfaceMuted"),
    ("'#F8FCFF'", "shell.surfaceMuted"),
    ("'#D0EEFF'", "shell.border"),
    ("'#CFEFFF'", "shell.border"),
    ("'#CFE8F7'", "shell.border"),
    ("'#D6EBF8'", "shell.border"),
    ("'#D5EAF7'", "shell.border"),
    ("'#D6F2FF'", "shell.border"),
    ("'#CDEFFF'", "shell.border"),
    ("'#C7E8FF'", "shell.border"),
    ("'#E5F2FA'", "shell.surfaceMuted"),
    ("'#EFFFF5'", "shell.storiesNormalBtnBg"),
    ("'#B9EFD0'", "shell.storiesNormalBtnBorder"),
    ("'#C5A065'", "shell.ctaAccent"),
    ("'#1E66A3'", "shell.refreshAccent"),
    ("'#2E668C'", "shell.textSecondary"),
    ("'#2F648A'", "shell.textSecondary"),
    ("'#3D6F92'", "shell.textSecondary"),
    ("'#3E7395'", "shell.textSecondary"),
    ("'#3A7093'", "shell.textSecondary"),
    ("'#346B8E'", "shell.textSecondary"),
    ("'#407797'", "shell.textSecondary"),
    ("'#4C7C9D'", "shell.textSecondary"),
    ("'#4F7D9B'", "shell.textSecondary"),
    ("'#5A7A90'", "shell.textSecondary"),
    ("'#3E7395'", "shell.textSecondary"),
    ("'#128A7E'", "shell.success"),
    ("'#4A4A4A'", "shell.textMuted"),
    ("'#000000'", "shell.subtleShadow"),
    ("'#000'", "shell.subtleShadow"),
    ("'#9EABBA'", "shell.textMuted"),
    ("'#66C7FF'", "shell.refreshAccent"),
    ("'#F4E8D4'", "shell.typeBadgeBg"),
    ("'#D4AF37'", "shell.ctaAccent"),
]
out = body
for a, b in rep:
    out = out.replace(a, b)

out = re.sub(r"'rgba\(13,77,138,[^']+\)'", "shell.border", out)
out = re.sub(r"'rgba\(255,255,255,[^']+\)'", "shell.surfaceMuted", out)
out = re.sub(r"'rgba\(10,37,64,[^']+\)'", "shell.overlayScrim", out)

header = """import { StyleSheet } from \"react-native\";
import type { AppShellTheme } from \"../theme\";

export function makeStoriesStyles(shell: AppShellTheme) {
  return StyleSheet.create("""
footer = """);
}
"""
out_path = root / "app" / "(tabs)" / "stories.styles.ts"
out_path.write_text(header + out + footer, encoding="utf-8")
print("written", out_path)
