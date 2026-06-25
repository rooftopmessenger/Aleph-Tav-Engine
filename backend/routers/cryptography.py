from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, List

from utils.ciphers import atbash_cipher, albam_cipher, atbah_cipher
from utils.gematria import calculate_gematria
from utils.normalization import normalize_hebrew_text

router = APIRouter(
    prefix="/api/cryptography",
    tags=["cryptography"]
)

class CryptographyRequest(BaseModel):
    text: str

class CryptographyResponse(BaseModel):
    text: str
    atbash: str
    albam: str
    atbah: str
    gematria_absolute: int
    gematria_ordinal: int
    gematria_reduced: int

class BatchCryptographyRequest(BaseModel):
    texts: List[str]

class BatchCryptographyResponse(BaseModel):
    results: List[CryptographyResponse]

@router.post("/analyze", response_model=CryptographyResponse)
def analyze_cryptography(request: CryptographyRequest):
    # Normalize the Hebrew text, ignoring spaces and non-Hebrew characters
    # Keep spaces False so it strips them?
    # "Ensure the cipher functions ignore spaces and non-Hebrew characters."
    # We can either filter them out completely or map over them. Let's filter them out completely.
    # Actually normalize_hebrew_text with keep_spaces=False will strip spaces.

    clean_text = normalize_hebrew_text(request.text, keep_spaces=False)

    return CryptographyResponse(
        text=clean_text,
        atbash=atbash_cipher(clean_text),
        albam=albam_cipher(clean_text),
        atbah=atbah_cipher(clean_text),
        gematria_absolute=calculate_gematria(clean_text, "absolute"),
        gematria_ordinal=calculate_gematria(clean_text, "ordinal"),
        gematria_reduced=calculate_gematria(clean_text, "reduced"),
    )

@router.post("/analyze/batch", response_model=BatchCryptographyResponse)
def analyze_cryptography_batch(request: BatchCryptographyRequest):
    results = []
    for text in request.texts:
        clean_text = normalize_hebrew_text(text, keep_spaces=False)
        results.append(CryptographyResponse(
            text=clean_text,
            atbash=atbash_cipher(clean_text),
            albam=albam_cipher(clean_text),
            atbah=atbah_cipher(clean_text),
            gematria_absolute=calculate_gematria(clean_text, "absolute"),
            gematria_ordinal=calculate_gematria(clean_text, "ordinal"),
            gematria_reduced=calculate_gematria(clean_text, "reduced"),
        ))
    return BatchCryptographyResponse(results=results)
