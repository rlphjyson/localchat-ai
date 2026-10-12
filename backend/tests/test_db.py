from sqlalchemy import inspect, text
from sqlmodel import create_engine
from sqlmodel.pool import StaticPool

from app.db import _add_missing_columns


def test_add_missing_columns_backfills_thinking_on_a_pre_reasoning_database() -> None:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with engine.begin() as connection:
        # The message table exactly as the first release created it.
        connection.execute(
            text(
                "CREATE TABLE message (id INTEGER PRIMARY KEY, conversation_id VARCHAR NOT NULL, "
                "role VARCHAR NOT NULL, content VARCHAR NOT NULL, created_at DATETIME NOT NULL)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO message (conversation_id, role, content, created_at) "
                "VALUES ('c1', 'assistant', 'old reply', '2026-01-01 00:00:00')"
            )
        )

    _add_missing_columns(engine)
    _add_missing_columns(engine)  # idempotent -- runs on every startup

    assert "thinking" in {c["name"] for c in inspect(engine).get_columns("message")}
    with engine.connect() as connection:
        row = connection.execute(text("SELECT content, thinking FROM message")).one()
    assert tuple(row) == ("old reply", "")
