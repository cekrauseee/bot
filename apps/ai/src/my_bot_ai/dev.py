"""Run the local AI service from the canonical environment."""

import uvicorn

from my_bot_ai.config import get_settings


def main() -> None:
    settings = get_settings()
    origin = settings.ai_base_url
    uvicorn.run(
        "my_bot_ai.main:app",
        host=origin.host,
        port=origin.port or (443 if origin.scheme == "https" else 80),
        reload=True,
    )


if __name__ == "__main__":
    main()
