from fastapi import FastAPI

from my_bot_api.routers.health import router as health_router


def create_app() -> FastAPI:
    application = FastAPI(title="myBOT API", version="0.1.0")
    application.include_router(health_router)
    return application


app = create_app()
