import unittest
from backend.services.ats_intelligence_service import (
    categorize_skills,
    extract_candidate_links,
    calculate_recommended_designations,
    calculate_ats_diagnostics,
    calibrate_ats_for_target,
)

class TestAtsIntelligenceService(unittest.TestCase):
    def test_categorize_skills(self):
        raw_skills = ["Python", "TypeScript", "React", "Docker", "PostgreSQL", "AWS", "Git", "FastAPI"]
        categorized = categorize_skills(raw_skills)
        self.assertIn("programming_languages", categorized)
        self.assertIn("frontend", categorized)
        self.assertIn("backend", categorized)
        self.assertIn("databases", categorized)
        self.assertIn("cloud_devops", categorized)
        self.assertIn("Python", categorized["programming_languages"])
        self.assertIn("React", categorized["frontend"])
        self.assertIn("Docker", categorized["cloud_devops"])
        self.assertIn("PostgreSQL", categorized["databases"])

    def test_extract_candidate_links(self):
        text = "Check my profiles: https://linkedin.com/in/johndoe and https://github.com/johndoe, plus my site at https://johndoe.dev"
        links = extract_candidate_links(text)
        self.assertIn("linkedin.com/in/johndoe", links.get("linkedin_url", "") or "")
        self.assertIn("github.com/johndoe", links.get("github_url", "") or "")
        self.assertTrue(bool(links.get("portfolio_url")))

    def test_calculate_recommended_designations_fresher(self):
        skills = ["Python", "Django", "SQL", "Git"]
        designations = calculate_recommended_designations(
            candidate_skills=skills,
            total_experience_str="Fresher (0 years)",
            resume_text="Recent computer science graduate with strong Python fundamentals."
        )
        self.assertTrue(len(designations) >= 3)
        titles = [d["designation"].lower() for d in designations]
        self.assertTrue(any("python" in t or "backend" in t or "junior" in t or "developer" in t for t in titles))
        for d in designations:
            self.assertTrue(0 <= d["match_percentage"] <= 100)
            self.assertIn("why_suitable", d)
            self.assertIn("career_advice", d)

    def test_calculate_ats_diagnostics(self):
        resume_text = "Jane Doe. Email: jane@example.com. Phone: +1 555-0199. Full stack engineer with experience building cloud applications."
        skills = ["Python", "FastAPI", "React", "Docker", "PostgreSQL"]
        experience = [{"title": "Software Engineer", "company": "Acme", "description": "Built REST APIs"}]
        education = [{"degree": "BS CS", "institution": "Tech University"}]
        
        diagnostics = calculate_ats_diagnostics(
            resume_text=resume_text,
            candidate_name="Jane Doe",
            email="jane@example.com",
            phone="+1 555-0199",
            location="San Francisco, CA",
            skills=skills,
            experience=experience,
            education=education
        )
        self.assertTrue(50 <= diagnostics["ats_score"] <= 100)
        self.assertIn("formatting_readability", diagnostics)
        self.assertIn("keyword_saturation", diagnostics)
        self.assertIn("observations", diagnostics)

    def test_calibrate_ats_for_target(self):
        candidate_skills = ["Python", "FastAPI", "PostgreSQL", "Docker"]
        resume_text = "Experienced with Python backend systems, FastAPI microservices, and Docker container deployments."
        result = calibrate_ats_for_target(
            resume_text=resume_text,
            target_designation="Junior Backend Developer",
            candidate_skills=candidate_skills
        )
        self.assertIn("target_designation", result)
        self.assertIn("ats_match_percentage", result)
        self.assertIn("matching_keywords", result)
        self.assertIn("missing_critical_keywords", result)
        self.assertIn("optimization_recommendations", result)
        self.assertTrue(any(k.lower() == "python" for k in result["matching_keywords"]))

if __name__ == "__main__":
    unittest.main()
