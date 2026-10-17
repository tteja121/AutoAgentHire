"""
Cover Letter Generation Routes
Separate endpoint for AI-powered cover letter generation
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.llm.gemini_service import get_gemini_service

router = APIRouter(prefix="/api/cover-letter", tags=["Cover Letter"])


class CoverLetterRequest(BaseModel):
    """Request model for cover letter generation"""
    job_description: str
    resume_text: str


@router.post("/generate")
async def generate_cover_letter_endpoint(request: CoverLetterRequest):
    """
    Generate tailored cover letter using Gemini AI
    """
    try:
        gemini = get_gemini_service()
        cover_letter = await asyncio.to_thread(
            gemini.generate_cover_letter,
            "Position from Job Description",
            "Company Name",
            request.job_description,
            request.resume_text[:3000],
            "Applicant"
        )

        if not cover_letter:
            raise HTTPException(status_code=500, detail="Failed to generate cover letter")

        return {
            "status": "success",
            "cover_letter": cover_letter.strip()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cover letter generation failed: {str(e)}")
