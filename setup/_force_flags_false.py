"""Force the three kanban dispatch flags to false in one profile config.

Called by disable-auto-orchestration.sh. A separate file rather than an
inline heredoc: the loop that calls it already runs inside a `for`, and a
nested heredoc there is fragile.
"""
import re
import sys

FLAGS = ("dispatch_in_gateway", "auto_decompose", "review_dispatch")

path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    text = fh.read()

for flag in FLAGS:
    text = re.sub(rf"^(\s*){flag}:\s*\w+", rf"\g<1>{flag}: false",
                  text, flags=re.MULTILINE)

with open(path, "w", encoding="utf-8") as fh:
    fh.write(text)
