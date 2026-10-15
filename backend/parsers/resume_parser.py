"""
Resume parser - Extracts information from resumes.
Supports PDF, DOCX, and TXT formats.
"""
from typing import Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    from pypdf import PdfReader as _PdfReader
    PDF_AVAILABLE = True
except ImportError:
    _PdfReader = None  # type: ignore[assignment]
    PDF_AVAILABLE = False
    logger.warning("pypdf not installed - PDF parsing disabled")

try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    logger.warning("python-docx not installed - DOCX parsing disabled")


class ResumeParser:
    """
    Parser for extracting information from resumes.
    """
    
    def __init__(self):
        """Initialize the resume parser."""
        self.supported_formats = ['.pdf', '.docx', '.txt']
    
    def parse(self, file_path: str) -> Dict[str, Any]:
        """
        Parse a resume file and extract structured information.
        
        Args:
            file_path: Path to the resume file
            
        Returns:
            Dictionary with extracted information
        """
        file_path_obj = Path(file_path)
        
        if not file_path_obj.exists():
            raise FileNotFoundError(f"Resume file not found: {file_path}")
        
        file_ext = file_path_obj.suffix.lower()
        
        if file_ext not in self.supported_formats:
            raise ValueError(f"Unsupported file format: {file_ext}")
        
        # Extract text based on file type
        if file_ext == '.pdf':
            text = self._extract_from_pdf(file_path)
        elif file_ext == '.docx':
            text = self._extract_from_docx(file_path)
        else:
            text = self._extract_from_txt(file_path)
        
        # Parse the extracted text
        parsed_data = self._parse_text(text)
        
        return parsed_data
    
    def _extract_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF file."""
        if not PDF_AVAILABLE or _PdfReader is None:
            return "PDF parsing not available - pypdf not installed"
        
        try:
            text = []
            with open(file_path, 'rb') as file:
                # Narrow optional import for static type checking.
                pdf_reader = _PdfReader(file)
                for page in pdf_reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text.append(page_text)
            return '\n'.join(text)
        except Exception as e:
            logger.error(f"Error extracting PDF: {e}")
            return ""
    
    def _extract_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX file."""
        if not DOCX_AVAILABLE:
            return "DOCX parsing not available - python-docx not installed"
        
        try:
            from docx import Document  # Import here to avoid unbound warning
            doc = Document(file_path)
            text = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text.append(paragraph.text)
            return '\n'.join(text)
        except Exception as e:
            logger.error(f"Error extracting DOCX: {e}")
            return ""
    
    def _extract_from_txt(self, file_path: str) -> str:
        """Extract text from TXT file."""
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    def _parse_text(self, text: str) -> Dict[str, Any]:
        """
        Parse extracted text to structured data using AI.
        
        Args:
            text: Raw text from resume
            
        Returns:
            Structured resume data
        """
        try:
            # Import here to avoid circular imports
            from backend.llm.multi_ai_service import MultiAIService
            
            # Use AI to extract structured data
            ai_service = MultiAIService()
            
            prompt = f"""
Extract structured information from the following resume text. Return ONLY a valid JSON object with these fields:

1. "skills": Array of technical and professional skills (programming languages, tools, frameworks, soft skills)
2. "experience": Array of objects with: "title", "company", "duration", "description"
3. "education": Array of objects with: "degree", "institution", "year"
4. "contact": Object with: "name", "email", "phone" (if available)
5. "summary": Brief 2-3 sentence professional summary

Resume text:
{text[:4000]}

Return ONLY the JSON object, no explanations or markdown formatting.
"""
            
            response = ai_service.generate_text(prompt)
            
            # Try to parse the AI response as JSON
            import json
            import re
            
            # Ensure response is a string
            if not response:
                response = "{}"
            
            # Extract JSON from response (in case AI adds extra text)
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                parsed_data = json.loads(json_match.group())
            else:
                # Fallback to basic structure
                parsed_data = {
                    "contact": {},
                    "experience": [],
                    "education": [],
                    "skills": [],
                    "summary": ""
                }
            
            # Ensure all required fields exist
            parsed_data.setdefault("contact", {})
            parsed_data.setdefault("experience", [])
            parsed_data.setdefault("education", [])
            parsed_data.setdefault("skills", [])
            parsed_data.setdefault("summary", "")
            parsed_data["raw_text"] = text
            
            # If AI missed contact or skills, supplement with rule-based extraction
            self._enrich_with_heuristics(parsed_data, text)

            return parsed_data
            
        except Exception as e:
            logger.error(f"Error parsing resume with AI: {e}")
            # Fallback to pure heuristic extraction
            parsed_data = {
                "contact": {},
                "experience": [],
                "education": [],
                "skills": [],
                "summary": "",
                "raw_text": text
            }
            self._enrich_with_heuristics(parsed_data, text)
            return parsed_data

    def _enrich_with_heuristics(self, data: Dict[str, Any], text: str) -> None:
        """Rule-based extraction for contact info, skills, and summary."""
        import re

        contact = data.setdefault("contact", {})
        # Email extraction
        if not contact.get("email"):
            email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b', text)
            if email_match:
                contact["email"] = email_match.group(0)

        # Phone extraction
        if not contact.get("phone"):
            phone_match = re.search(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
            if phone_match:
                contact["phone"] = phone_match.group(0)

        # Name extraction (usually first non-empty line of the resume)
        if not contact.get("name"):
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            for line in lines[:5]:
                # Exclude header titles like 'Resume', 'Curriculum Vitae', email or phone lines
                if re.search(r'@|http|\.com|phone|resume|curriculum|vitae', line, re.I):
                    continue
                words = line.split()
                if 2 <= len(words) <= 4 and all(w[0].isupper() for w in words if w.isalpha()):
                    contact["name"] = line
                    break

        # Location extraction (City, ST or Country)
        if not contact.get("city") or not contact.get("state"):
            loc_match = re.search(r'\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b', text)
            if loc_match:
                contact["city"] = loc_match.group(1).strip()
                contact["state"] = loc_match.group(2).strip()

        # Skills extraction from common skill keywords dictionary
        common_skills = [
            "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java", "C++", "C#",
            "SQL", "PostgreSQL", "MySQL", "MongoDB", "AWS", "Azure", "GCP", "Docker",
            "Kubernetes", "Git", "GitHub", "Linux", "HTML", "CSS", "TailwindCSS", "FastAPI",
            "Django", "Flask", "GraphQL", "REST API", "Redux", "Next.js", "Pandas", "NumPy",
            "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "CI/CD", "Agile",
            "Scrum", "Jest", "Playwright", "Selenium", "Redis", "Kafka", "Microservices"
        ]
        existing_skills = set(s.lower() for s in (data.get("skills") or []))
        found_skills = list(data.get("skills") or [])
        for skill in common_skills:
            if skill.lower() not in existing_skills:
                # Word boundary match
                pattern = r'\b' + re.escape(skill) + r'\b'
                if re.search(pattern, text, re.I):
                    found_skills.append(skill)
                    existing_skills.add(skill.lower())
        data["skills"] = found_skills

        # Summary fallback
        if not data.get("summary") and len(text.strip()) > 0:
            # Take the first paragraph that looks like a summary/objective
            paragraphs = [p.strip() for p in text.split('\n\n') if len(p.strip()) > 60]
            if paragraphs:
                data["summary"] = paragraphs[0][:300]


# Helper function for backward compatibility
def extract_resume_text(file_path: str) -> str:
    """
    Extract raw text from a resume file.
    
    Args:
        file_path: Path to the resume file
        
    Returns:
        Extracted text from the resume
    """
    parser = ResumeParser()
    result = parser.parse(file_path)
    return result.get("raw_text", "")
