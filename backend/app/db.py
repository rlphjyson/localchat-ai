import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

settings = get_settings()


def _sqlite_file_path(database_url: str) -> str | None:
    # Deliberately not urlparse+lstrip("/") -- that combination silently breaks an absolute
    # POSIX sqlite path (sqlite:////abs/path has 4 slashes, so the parsed path component itself
    # already carries a leading slash before the real path; lstrip("/") strips both, turning
    # "/abs/path" into the relative path "abs/path"). Ported from agent-ops-dashboard's db.py,
    # where this exact bug was found and fixed after passing on Windows but failing in Linux CI.
    # Everything after the literal "sqlite:///" prefix is the filesystem path verbatim, per
    # SQLAlchemy's own convention.
    if ":memory:" in database_url or not database_url.startswith("sqlite:///"):
        return None
    return database_url[len("sqlite:///") :]


def _ensure_sqlite_dir_exists(database_url: str) -> None:
    db_path = _sqlite_file_path(database_url)
    if db_path is None:
        return
    parent = Path(db_path).parent
    if str(parent) not in ("", "."):
        os.makedirs(parent, exist_ok=True)


_ensure_sqlite_dir_exists(settings.database_url)
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_engine() -> Engine:
    """FastAPI-resolvable so the streaming chat endpoint (which opens its own Session outside
    the request-scoped Depends lifecycle, since it keeps writing after the endpoint function
    itself has returned a StreamingResponse) can be handed the right engine -- including the
    in-memory test engine when overridden in tests."""
    return engine


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
