"""
Database setup and models for portfolio and saved screens
Uses SQLite with SQLAlchemy for simplicity (can migrate to PostgreSQL later)
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, JSON, Text, UniqueConstraint, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import os

# Database file path
DB_PATH = os.path.join(os.path.dirname(__file__), 'quantdash.db')
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

# For sync operations (migrations, etc.)
SYNC_DATABASE_URL = f"sqlite:///{DB_PATH}"

Base = declarative_base()


class PortfolioHolding(Base):
    """Portfolio holding model"""
    __tablename__ = "portfolio_holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)  # For future multi-user support
    symbol = Column(String, nullable=False, index=True)
    shares = Column(Float, nullable=False)
    average_cost = Column(Float, nullable=False)
    purchase_date = Column(DateTime, nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "symbol": self.symbol,
            "shares": self.shares,
            "averageCost": self.average_cost,
            "purchaseDate": self.purchase_date.isoformat() if self.purchase_date else None,
            "addedAt": self.added_at.isoformat() if self.added_at else None,
        }


class SavedScreen(Base):
    """Saved screener screen model"""
    __tablename__ = "saved_screens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)  # For future multi-user support
    name = Column(String, nullable=False)
    filters = Column(JSON, nullable=False)  # Stores ScreenerFilters as JSON
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "filters": self.filters,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "lastUsed": self.last_used.isoformat() if self.last_used else None,
        }


class IndustryFilterDefault(Base):
    """Persisted default filters per industry or sector"""
    __tablename__ = "industry_filter_defaults"
    __table_args__ = (
        UniqueConstraint("user_id", "scope", "scope_value", name="uq_filter_scope"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    scope = Column(String, nullable=False)  # 'industry' or 'sector'
    scope_value = Column(String, nullable=False)
    filters = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "scope": self.scope,
            "scopeValue": self.scope_value,
            "filters": self.filters,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(Base):
    """Basic user model for authentication."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    password_salt = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class UserSession(Base):
    """Session tokens for authenticated users."""
    __tablename__ = "user_sessions"
    __table_args__ = (
        UniqueConstraint("token", name="uq_user_session_token"),
    )

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    token = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
        }


# Create sync engine for migrations
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Create tables
def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=sync_engine)
    with sync_engine.begin() as conn:
        # Lightweight migrations for existing SQLite DBs.
        tables = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
        table_names = {row[0] for row in tables}
        if "users" in table_names:
            cols = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            col_names = {row[1] for row in cols}
            if "first_name" not in col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN first_name VARCHAR"))
            if "last_name" not in col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN last_name VARCHAR"))


# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)


def get_db():
    """Get database session (sync version for now)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
