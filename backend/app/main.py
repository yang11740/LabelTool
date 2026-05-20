from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import auth, datasets, fs, projects, tasks, users

app = FastAPI(title="Labelme Web API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fs.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(datasets.router)
app.include_router(tasks.router)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
