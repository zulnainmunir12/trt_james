"""Read the model provider settings Hermes is already configured with.

We deliberately reuse Hermes' own ~/.hermes/.env and config.yaml rather than
keeping a second copy of the credentials. One place to rotate a key.

Stdlib only - no dependency on Hermes' virtualenv, so these modules run
under any Python 3.10+ and are easy to test.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
ENV_FILE = HERMES_HOME / ".env"
CONFIG_FILE = HERMES_HOME / "config.yaml"

DEFAULT_MODEL = "gemini-3.6-flash"
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


class ConfigError(RuntimeError):
    pass


def _read_env_value(name: str) -> str | None:
    """Pull a single value out of Hermes' .env.

    Not a full dotenv parser: the file is ~27 KB of mostly-commented
    templates, and we only ever want a handful of known keys.
    """
    if not ENV_FILE.exists():
        return None
    pattern = re.compile(rf"^{re.escape(name)}=(.*)$", re.MULTILINE)
    match = pattern.search(ENV_FILE.read_text(encoding="utf-8"))
    if not match:
        return None
    value = match.group(1).strip().strip('"').strip("'")
    return value or None


def _read_configured_model() -> str:
    """Read model.default from config.yaml without a YAML dependency.

    The key appears once inside the `model:` block. If the file shape ever
    changes this falls back to the pinned default rather than guessing.
    """
    if not CONFIG_FILE.exists():
        return DEFAULT_MODEL
    text = CONFIG_FILE.read_text(encoding="utf-8")
    match = re.search(r'^\s*default:\s*"([^"]+)"', text, re.MULTILINE)
    return match.group(1) if match else DEFAULT_MODEL


@dataclass(frozen=True)
class ProviderConfig:
    api_key: str
    model: str

    @property
    def endpoint(self) -> str:
        return GEMINI_ENDPOINT.format(model=self.model)


def load_provider() -> ProviderConfig:
    """Resolve the Gemini credentials Hermes is using.

    Environment variables win over the .env file so tests and CI can inject
    their own key without touching the developer's Hermes install.
    """
    key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or _read_env_value("GEMINI_API_KEY")
        or _read_env_value("GOOGLE_API_KEY")
    )
    if not key:
        raise ConfigError(
            f"No Gemini API key found. Looked at $GEMINI_API_KEY, "
            f"$GOOGLE_API_KEY and {ENV_FILE}. "
            f"Run: python3 setup/configure-provider.py gemini <KEY>"
        )
    model = os.environ.get("HERMES_TRT_MODEL") or _read_configured_model()
    return ProviderConfig(api_key=key, model=model)
