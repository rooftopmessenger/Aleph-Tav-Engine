import os
import re
from typing import Annotated, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from sqlalchemy.orm import joinedload

# Import models
from ingest_db import User, SavedNote, Verse, Book, Anomaly

router = APIRouter(
    prefix="/api/export",
    tags=["export"]
)

DATABASE_URL = "sqlite+aiosqlite:///kjv_strongs.db"
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "supersecretkey_for_testing_purposes_only_change_in_prod")
ALGORITHM = "HS256"

async_engine = create_async_engine(
    DATABASE_URL, 
    echo=False, 
    connect_args={"check_same_thread": False}
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

DbSession = Annotated[AsyncSession, Depends(get_db)]
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

async def get_current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)], db: DbSession) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

def get_pardes_level(text: str) -> str:
    lower = text.lower() if text else ""
    if any(tag in lower for tag in ["#peshat", "[peshat]", "peshat:"]):
        return "Peshat"
    if any(tag in lower for tag in ["#remez", "[remez]", "remez:"]):
        return "Remez"
    if any(tag in lower for tag in ["#derash", "[derash]", "derash:"]):
        return "Derash"
    if any(tag in lower for tag in ["#sod", "[sod]", "sod:"]):
        return "Sod"
    return "General"

@router.get("/notes")
async def export_notes(
    group_by: str,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if group_by not in ["book", "type"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_by must be 'book' or 'type'"
        )

    # Fetch notes for the authenticated user, eagerly loading the verse and book
    stmt = (
        select(SavedNote)
        .where(SavedNote.user_id == current_user.id)
        .options(
            joinedload(SavedNote.verse).joinedload(Verse.book)
        )
    )
    result = await db.execute(stmt)
    notes = result.scalars().all()

    if not notes:
        return Response(
            content="# Study Notes Export\n\nNo notes found to export.",
            media_type="text/markdown",
            headers={"Content-Disposition": "attachment; filename=study_notes.md"}
        )

    markdown_parts = []
    markdown_parts.append(f"# Aleph-Tav Study Notes Export")
    markdown_parts.append(f"Generated on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    markdown_parts.append(f"User: {current_user.email}")
    markdown_parts.append(f"Export Mode: Grouped by {group_by.capitalize()}\n")

    if group_by == "book":
        # Group by book
        from collections import defaultdict
        grouped = defaultdict(list)
        for note in notes:
            book_name = note.verse.book.name if note.verse and note.verse.book else "General/Unknown"
            grouped[book_name].append(note)

        # Sort books by their ID or alphabetical
        for book_name in sorted(grouped.keys()):
            markdown_parts.append(f"## {book_name}")
            # Sort notes by chapter, then verse, then date
            sorted_notes = sorted(
                grouped[book_name],
                key=lambda n: (n.verse.chapter if n.verse else 0, n.verse.verse if n.verse else 0, n.created_at)
            )
            for note in sorted_notes:
                osis_id = note.verse.osis_id if note.verse else "Unknown Verse"
                hebrew = note.verse.hebrew_text if note.verse else ""
                english = note.verse.english_text if note.verse else ""
                pardes = get_pardes_level(note.note_text)
                
                markdown_parts.append(f"### {osis_id} ({pardes})")
                if hebrew:
                    markdown_parts.append(f"**Hebrew**: {hebrew}")
                if english:
                    markdown_parts.append(f"**English**: *{english}*")
                markdown_parts.append(f"**Note**: {note.note_text}")
                markdown_parts.append(f"**Created**: {note.created_at.strftime('%Y-%m-%d') if note.created_at else ''}\n")
    
    elif group_by == "type":
        # Group by Pardes level
        grouped = {"Peshat": [], "Remez": [], "Derash": [], "Sod": [], "General": []}
        for note in notes:
            level = get_pardes_level(note.note_text)
            grouped[level].append(note)

        for level in ["Peshat", "Remez", "Derash", "Sod", "General"]:
            if not grouped[level]:
                continue
            
            # Label in Hebrew too for beautiful look
            hebrew_label = {"Peshat": "פְּשָׁט", "Remez": "רֶמֶז", "Derash": "דְּרַשׁ", "Sod": "סוֹד", "General": "כללי"}[level]
            markdown_parts.append(f"## {level} ({hebrew_label})")
            
            # Sort notes by book, chapter, verse
            sorted_notes = sorted(
                grouped[level],
                key=lambda n: (
                    n.verse.book.id if n.verse and n.verse.book else 0,
                    n.verse.chapter if n.verse else 0,
                    n.verse.verse if n.verse else 0,
                    n.created_at
                )
            )
            for note in sorted_notes:
                osis_id = note.verse.osis_id if note.verse else "Unknown Verse"
                book_name = note.verse.book.name if note.verse and note.verse.book else "General"
                hebrew = note.verse.hebrew_text if note.verse else ""
                english = note.verse.english_text if note.verse else ""
                
                markdown_parts.append(f"### {book_name} - {osis_id}")
                if hebrew:
                    markdown_parts.append(f"**Hebrew**: {hebrew}")
                if english:
                    markdown_parts.append(f"**English**: *{english}*")
                markdown_parts.append(f"**Note**: {note.note_text}")
                markdown_parts.append(f"**Created**: {note.created_at.strftime('%Y-%m-%d') if note.created_at else ''}\n")

    full_markdown = "\n".join(markdown_parts)
    filename = f"study_notes_by_{group_by}.md"
    
    return Response(
        content=full_markdown,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.get("/anomalies")
async def export_anomalies(
    format: str,
    group_by: str,
    db: DbSession
):
    import csv
    import json
    import io

    if format not in ["csv", "json", "markdown"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="format must be 'csv', 'json', or 'markdown'"
        )
    if group_by not in ["book", "type"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="group_by must be 'book' or 'type'"
        )

    # Fetch all anomalies and eagerly load their corresponding verse text
    stmt = (
        select(Anomaly, Verse)
        .outerjoin(Verse, Anomaly.osis_id == Verse.osis_id)
    )
    result = await db.execute(stmt)
    results = result.all()
    
    anomalies = [r[0] for r in results]
    verse_map = {r[1].osis_id: r[1] for r in results if r[1] is not None}

    if not anomalies:
        if format == "json":
            return Response(content="[]", media_type="application/json")
        elif format == "csv":
            return Response(content="", media_type="text/csv")
        else:
            return Response(content="# Anomalies Export\n\nNo anomalies found.", media_type="text/markdown")

    filename = f"anomalies_by_{group_by}.{format if format != 'markdown' else 'md'}"

    if format == "json":
        data = []
        for a in anomalies:
            data.append({
                "id": a.id,
                "book": a.book,
                "chapter": a.chapter,
                "verse": a.verse,
                "osis_id": a.osis_id,
                "anomaly_type": a.anomaly_type,
                "score": a.score,
                "notes": a.notes,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None
            })
        
        if group_by == "book":
            from collections import defaultdict
            grouped = defaultdict(list)
            for item in data:
                grouped[item["book"]].append(item)
            content = json.dumps(grouped, indent=2)
        else:
            from collections import defaultdict
            grouped = defaultdict(list)
            for item in data:
                grouped[item["anomaly_type"]].append(item)
            content = json.dumps(grouped, indent=2)

        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "book", "chapter", "verse", "osis_id", "anomaly_type", "score", "notes", "timestamp"])
        
        sorted_anomalies = sorted(anomalies, key=lambda a: (a.book, a.chapter, a.verse))
        for a in sorted_anomalies:
            writer.writerow([
                a.id, a.book, a.chapter, a.verse, a.osis_id, a.anomaly_type, a.score, a.notes,
                a.timestamp.isoformat() if a.timestamp else ""
            ])
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    elif format == "markdown":
        markdown_parts = []
        markdown_parts.append(f"# Aleph-Tav Cryptographic Anomalies Export")
        markdown_parts.append(f"Generated on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
        markdown_parts.append(f"Export Mode: Grouped by {group_by.capitalize()}\n")

        if group_by == "book":
            from collections import defaultdict
            grouped = defaultdict(list)
            for a in anomalies:
                grouped[a.book].append(a)

            for book in sorted(grouped.keys()):
                markdown_parts.append(f"## {book}")
                sorted_items = sorted(grouped[book], key=lambda a: (a.chapter, a.verse))
                for a in sorted_items:
                    markdown_parts.append(
                        f"- **{a.osis_id}** | Type: `{a.anomaly_type}` | Score: `{a.score:.4f}`"
                    )
                    if a.notes:
                        markdown_parts.append(f"  - *Notes*: {a.notes}")
                    
                    v = verse_map.get(a.osis_id)
                    if v:
                        markdown_parts.append(f"  > **KJV**: {v.english_text}")
                        if v.hebrew_text:
                            markdown_parts.append(f"  > **Original**: {v.hebrew_text}")
                    markdown_parts.append("")

        elif group_by == "type":
            from collections import defaultdict
            grouped = defaultdict(list)
            for a in anomalies:
                grouped[a.anomaly_type].append(a)

            for a_type in sorted(grouped.keys()):
                type_desc = {
                    "entropy_high": "High Shannon Entropy (High Complexity)",
                    "entropy_low": "Low Shannon Entropy (Low Complexity/Repetitive)",
                    "gematria_high": "High Gematria Sum (High Numerical Density)"
                }.get(a_type, a_type)
                
                markdown_parts.append(f"## {type_desc}")
                sorted_items = sorted(grouped[a_type], key=lambda a: (a.book, a.chapter, a.verse))
                for a in sorted_items:
                    markdown_parts.append(
                        f"- **{a.osis_id}** ({a.book}) | Score: `{a.score:.4f}`"
                    )
                    if a.notes:
                        markdown_parts.append(f"  - *Notes*: {a.notes}")
                    
                    v = verse_map.get(a.osis_id)
                    if v:
                        markdown_parts.append(f"  > **KJV**: {v.english_text}")
                        if v.hebrew_text:
                            markdown_parts.append(f"  > **Original**: {v.hebrew_text}")
                    markdown_parts.append("")

        full_markdown = "\n".join(markdown_parts)
        return Response(
            content=full_markdown,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

