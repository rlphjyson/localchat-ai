from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_engine, get_session
from app.main import app
from app.services.ollama_client import get_ollama_client
from tests.fakes import FakeOllamaClient


@pytest.fixture(name="test_engine")
def test_engine_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="session")
def session_fixture(test_engine) -> Generator[Session, None, None]:
    with Session(test_engine) as session:
        yield session


@pytest.fixture(name="fake_ollama")
def fake_ollama_fixture() -> FakeOllamaClient:
    return FakeOllamaClient()


@pytest.fixture(name="client")
def client_fixture(
    session: Session, test_engine, fake_ollama: FakeOllamaClient
) -> Generator[TestClient, None, None]:
    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_engine] = lambda: test_engine
    app.dependency_overrides[get_ollama_client] = lambda: fake_ollama

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()
