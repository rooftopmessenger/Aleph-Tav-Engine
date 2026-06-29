import os
import sys
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

# Add current directory to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from ingest_db import Base, Verse, TempleDimension

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5433/aleph_tav_db")
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg://")

print(f"Connecting to database: {DATABASE_URL}")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

temple_data = [
    # 1 Kings 6
    {"osis_id": "1Kgs.6.2", "object_name": "Temple House", "measurement_type": "length", "value": 60.0},
    {"osis_id": "1Kgs.6.2", "object_name": "Temple House", "measurement_type": "width", "value": 20.0},
    {"osis_id": "1Kgs.6.2", "object_name": "Temple House", "measurement_type": "height", "value": 30.0},
    
    {"osis_id": "1Kgs.6.3", "object_name": "Temple Porch", "measurement_type": "length", "value": 20.0},
    {"osis_id": "1Kgs.6.3", "object_name": "Temple Porch", "measurement_type": "width", "value": 10.0},
    
    {"osis_id": "1Kgs.6.20", "object_name": "Holy of Holies", "measurement_type": "length", "value": 20.0},
    {"osis_id": "1Kgs.6.20", "object_name": "Holy of Holies", "measurement_type": "width", "value": 20.0},
    {"osis_id": "1Kgs.6.20", "object_name": "Holy of Holies", "measurement_type": "height", "value": 20.0},
    
    {"osis_id": "1Kgs.6.23", "object_name": "Cherub", "measurement_type": "height", "value": 10.0},
    
    # 1 Kings 7
    {"osis_id": "1Kgs.7.2", "object_name": "House of the Forest of Lebanon", "measurement_type": "length", "value": 100.0},
    {"osis_id": "1Kgs.7.2", "object_name": "House of the Forest of Lebanon", "measurement_type": "width", "value": 50.0},
    {"osis_id": "1Kgs.7.2", "object_name": "House of the Forest of Lebanon", "measurement_type": "height", "value": 30.0},
    
    {"osis_id": "1Kgs.7.6", "object_name": "Porch of Pillars", "measurement_type": "length", "value": 50.0},
    {"osis_id": "1Kgs.7.6", "object_name": "Porch of Pillars", "measurement_type": "width", "value": 30.0},
    
    {"osis_id": "1Kgs.7.15", "object_name": "Pillar (Jachin/Boaz)", "measurement_type": "height", "value": 18.0},
    {"osis_id": "1Kgs.7.15", "object_name": "Pillar (Jachin/Boaz)", "measurement_type": "circumference", "value": 12.0},
    
    {"osis_id": "1Kgs.7.16", "object_name": "Pillar Capital", "measurement_type": "height", "value": 5.0},
    
    {"osis_id": "1Kgs.7.23", "object_name": "Molten Sea", "measurement_type": "diameter", "value": 10.0},
    {"osis_id": "1Kgs.7.23", "object_name": "Molten Sea", "measurement_type": "height", "value": 5.0},
    {"osis_id": "1Kgs.7.23", "object_name": "Molten Sea", "measurement_type": "circumference", "value": 30.0},
    
    {"osis_id": "1Kgs.7.27", "object_name": "Laver Base", "measurement_type": "length", "value": 4.0},
    {"osis_id": "1Kgs.7.27", "object_name": "Laver Base", "measurement_type": "width", "value": 4.0},
    {"osis_id": "1Kgs.7.27", "object_name": "Laver Base", "measurement_type": "height", "value": 3.0},
    
    {"osis_id": "1Kgs.7.38", "object_name": "Laver", "measurement_type": "diameter", "value": 4.0},
    
    # 2 Chronicles 3
    {"osis_id": "2Chr.3.3", "object_name": "Temple House", "measurement_type": "length", "value": 60.0},
    {"osis_id": "2Chr.3.3", "object_name": "Temple House", "measurement_type": "width", "value": 20.0},
    
    {"osis_id": "2Chr.3.4", "object_name": "Temple Porch", "measurement_type": "length", "value": 20.0},
    {"osis_id": "2Chr.3.4", "object_name": "Temple Porch", "measurement_type": "height", "value": 120.0},
    
    {"osis_id": "2Chr.3.8", "object_name": "Holy of Holies", "measurement_type": "length", "value": 20.0},
    {"osis_id": "2Chr.3.8", "object_name": "Holy of Holies", "measurement_type": "width", "value": 20.0},
    
    {"osis_id": "2Chr.3.11", "object_name": "Cherub Wingspan", "measurement_type": "wingspan", "value": 20.0},
    
    {"osis_id": "2Chr.3.15", "object_name": "Pillar (Jachin/Boaz)", "measurement_type": "height", "value": 35.0},
    
    # 2 Chronicles 4
    {"osis_id": "2Chr.4.1", "object_name": "Altar", "measurement_type": "length", "value": 20.0},
    {"osis_id": "2Chr.4.1", "object_name": "Altar", "measurement_type": "width", "value": 20.0},
    {"osis_id": "2Chr.4.1", "object_name": "Altar", "measurement_type": "height", "value": 10.0},
    
    {"osis_id": "2Chr.4.2", "object_name": "Molten Sea", "measurement_type": "diameter", "value": 10.0},
    {"osis_id": "2Chr.4.2", "object_name": "Molten Sea", "measurement_type": "height", "value": 5.0},
    {"osis_id": "2Chr.4.2", "object_name": "Molten Sea", "measurement_type": "circumference", "value": 30.0},
]

def seed_temple_dimensions():
    session = SessionLocal()
    try:
        # Clear existing temple dimensions
        print("Clearing existing temple dimensions...")
        session.query(TempleDimension).delete()
        session.commit()
        
        # Verify verses exist and insert dimensions
        seeded_count = 0
        for data in temple_data:
            osis_id = data["osis_id"]
            # Find verse id
            stmt = select(Verse).where(Verse.osis_id == osis_id)
            verse = session.execute(stmt).scalar_one_or_none()
            
            if not verse:
                print(f"WARNING: Verse not found for OSIS ID: {osis_id}. Skipping.")
                continue
                
            dim = TempleDimension(
                osis_id=osis_id,
                object_name=data["object_name"],
                measurement_type=data["measurement_type"],
                value=data["value"]
            )
            session.add(dim)
            seeded_count += 1
            
        session.commit()
        print(f"Successfully seeded {seeded_count} temple dimensions.")
    except Exception as e:
        session.rollback()
        print(f"Error seeding database: {e}")
        sys.exit(1)
    finally:
        session.close()

if __name__ == "__main__":
    seed_temple_dimensions()
