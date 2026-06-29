import os
import json
from typing import Annotated, List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import numpy as np
import faiss

# Import resources from existing search router to avoid model duplication and memory overhead
from routers.semantic_search import load_semantic_resources, get_db
from ingest_db import Verse

router = APIRouter(
    prefix="/api/topology",
    tags=["semantic-topology"]
)

class Node(BaseModel):
    id: str
    osis_id: str
    text: str
    similarity: float

class Link(BaseModel):
    source: str
    target: str
    value: float

class TopologyResponse(BaseModel):
    nodes: List[Node]
    links: List[Link]

@router.get("/search", response_model=TopologyResponse)
async def semantic_topology_search(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(..., min_length=1, description="Text query to project into 3D topology"),
    k: int = Query(15, ge=5, le=50, description="Number of nodes to return")
):
    # 1. Load resources
    try:
        load_semantic_resources()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load semantic resources: {e}"
        )

    # Import reference to the global lazy-loaded model/index
    from routers.semantic_search import model, verse_index, verse_metadata

    if model is None or verse_index is None or verse_metadata is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Semantic index resources could not be loaded successfully."
        )

    # 2. Vectorize the search query
    try:
        query_vector = model.encode([q]).astype('float32')
        faiss.normalize_L2(query_vector)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to vectorize query: {e}"
        )

    # 3. Search Scripture index for top k matches
    v_scores, v_indices = verse_index.search(query_vector, k)
    
    v_matches = []
    for score, idx_pos in zip(v_scores[0], v_indices[0]):
        if idx_pos == -1 or idx_pos >= len(verse_metadata):
            continue
        v_meta = verse_metadata[idx_pos]
        v_matches.append({
            "id": v_meta["id"],
            "osis_id": v_meta["osis_id"],
            "score": float(score)
        })

    if not v_matches:
        return TopologyResponse(nodes=[], links=[])

    # 4. Fetch detail records from database to get the English text
    v_ids = [item["id"] for item in v_matches]
    stmt = select(Verse).where(Verse.id.in_(v_ids))
    result = await db.execute(stmt)
    db_verses = {v.id: v for v in result.scalars().all()}

    # 5. Build nodes list and collect their text for embedding calculation
    nodes = []
    ordered_verse_texts = []
    ordered_node_ids = []
    
    for item in v_matches:
        db_v = db_verses.get(item["id"])
        if db_v:
            nodes.append(Node(
                id=db_v.osis_id,
                osis_id=db_v.osis_id,
                text=db_v.english_text,
                similarity=item["score"]
            ))
            ordered_verse_texts.append(db_v.english_text)
            ordered_node_ids.append(db_v.osis_id)

    # 6. Compute pairwise similarities between the top K nodes to establish edges
    links = []
    if len(ordered_verse_texts) > 1:
        try:
            # Encode all matches
            node_embeddings = model.encode(ordered_verse_texts).astype('float32')
            faiss.normalize_L2(node_embeddings)
            
            # Matrix multiplication of embeddings yields the pairwise cosine similarities
            similarity_matrix = np.dot(node_embeddings, node_embeddings.T)
            
            # Link generation: Connect any two nodes if their similarity > threshold
            threshold = 0.45
            for i in range(len(ordered_node_ids)):
                for j in range(i + 1, len(ordered_node_ids)):
                    sim = float(similarity_matrix[i, j])
                    if sim > threshold:
                        links.append(Link(
                            source=ordered_node_ids[i],
                            target=ordered_node_ids[j],
                            value=sim
                        ))
        except Exception as e:
            # Fallback to empty links if pairwise encoding fails for any reason
            print(f"Error computing pairwise node similarity: {e}")

    return TopologyResponse(nodes=nodes, links=links)
