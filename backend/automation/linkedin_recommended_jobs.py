"""LinkedIn Recommended Jobs Scraper.

Playwright automation for fetching LinkedIn's recommended jobs list.
"""

import os
import sys
import asyncio
from typing import List, Dict, Set, Optional, Any
from playwright.async_api import async_playwright, Page, Browser
from dotenv import load_dotenv

if sys.platform == 'win32' and sys.version_info < (3, 8):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

load_dotenv()

from pathlib import Path

class LinkedInRecommendedJobsScraper:
    """
    Scraper for LinkedIn recommended jobs using session state in browser_profile.
    """
    
    def __init__(self):
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.playwright = None
        self.context = None

    def _is_logged_in_url(self, url: str) -> bool:
        """Heuristic: URLs that indicate the session is authenticated."""
        u = (url or "").lower()
        return any(token in u for token in ["/feed", "/mynetwork", "/jobs", "/in/"]) and "/login" not in u

    def _is_checkpoint_url(self, url: str) -> bool:
        u = (url or "").lower()
        return any(token in u for token in ["checkpoint", "challenge", "captcha", "authwall"]) 
        
    async def standard_wait(self, seconds: float = 1.0):
        """Standard explicit wait without randomized delays."""
        await asyncio.sleep(seconds)

    def _page_alive(self) -> bool:
        """Return True if page exists and is not closed."""
        try:
            return self.page is not None and not self.page.is_closed()
        except Exception:
            return False

    @property
    def active_page(self) -> Page:
        """Return the active Playwright page, raising RuntimeError if not ready or closed."""
        if self.page is None or self.page.is_closed():
            raise RuntimeError("Page is not available (closed or not initialized)")
        return self.page

    async def _safe_evaluate(self, script: str):
        """Evaluate JS only if the page is still alive."""
        page = self.active_page
        return await page.evaluate(script)
        
    async def initialize_browser(self):
        """Launch browser using persistent session profile without stealth evasion."""
        from backend.config import settings
        is_headless = settings.PLAYWRIGHT_HEADLESS
        self.playwright = await async_playwright().start()

        profile_dir = Path("browser_profile")
        profile_dir.mkdir(exist_ok=True)

        self.context = await self.playwright.chromium.launch_persistent_context(
            str(profile_dir),
            headless=is_headless,
            viewport={'width': 1920, 'height': 1080},
        )
        
        if len(self.context.pages) > 0:
            self.page = self.context.pages[0]
        else:
            self.page = await self.context.new_page()
        
    async def login_to_linkedin(self) -> bool:
        """
        Ensure user is authenticated to LinkedIn using persistent session.
        If not authenticated, pause and allow the user to sign in manually.
        Never collects or stores passwords.
        """
        try:
            page = self.active_page
            print("🔐 Checking LinkedIn authentication status...")
            await page.goto("https://www.linkedin.com/feed", timeout=60000, wait_until="domcontentloaded")
            await self.standard_wait(2.0)

            if self._is_logged_in_url(page.url):
                print("✅ Already logged in via persistent session!")
                return True

            if self._is_checkpoint_url(page.url):
                print("\n⚠️  Security checkpoint detected! Please resolve it in the browser window.")
                for _ in range(36):  # Wait up to 180s
                    await asyncio.sleep(5)
                    if not self._is_checkpoint_url(page.url) and self._is_logged_in_url(page.url):
                        print("✅ Checkpoint resolved!")
                        return True
                return False

            # Navigate to login page and pause for manual login
            print("\n" + "="*60)
            print("🔐 MANUAL LOGIN REQUIRED")
            print("Please log into LinkedIn in the browser window.")
            print("Your session will be saved in browser_profile for future runs.")
            print("="*60 + "\n")
            await page.goto("https://www.linkedin.com/login", timeout=60000, wait_until="domcontentloaded")

            # Wait up to 3 minutes for user to sign in manually
            for i in range(36):
                await asyncio.sleep(5)
                current_url = page.url
                if self._is_checkpoint_url(current_url):
                    print("⚠️  Security checkpoint/CAPTCHA detected. Please resolve it in the browser window.")
                    continue
                if self._is_logged_in_url(current_url):
                    print("✅ Login successful! Session saved to browser_profile.")
                    return True

            print("❌ Manual login timed out after 180 seconds.")
            return False
                
        except Exception as e:
            print(f"❌ Login verification error: {str(e)}")
            return False
            
    async def navigate_to_recommended_jobs(self) -> bool:
        """
        Navigate to LinkedIn recommended jobs page
        
        Returns:
            bool: True if navigation successful
        """
        try:
            print("🧭 Navigating to Recommended Jobs...")
            page = self.active_page
            await page.goto(
                "https://www.linkedin.com/jobs/collections/recommended/",
                timeout=60000,
                wait_until="domcontentloaded"
            )
            await self.standard_wait(2.0)
            
            # Wait for job listings to load
            try:
                await page.wait_for_selector(
                    "li.jobs-search-results__list-item, div.job-card-container",
                    timeout=10000
                )
                print("✅ Recommended jobs page loaded")
                return True
            except Exception:
                print("⚠️  No job cards found, but continuing...")
                return True
                
        except Exception as e:
            print(f"❌ Navigation error: {str(e)}")
            return False
            
    async def scroll_and_load_jobs(self, scroll_iterations: int = 8):
        """
        Scroll page to load lazy-loaded job cards
        
        Args:
            scroll_iterations: Number of times to scroll
        """
        print(f"📜 Scrolling to load jobs ({scroll_iterations} iterations)...")

        _ = self.active_page
        
        for i in range(scroll_iterations):
            # Scroll down
            await self._safe_evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
            await self.standard_wait(1.5)
                
        # Scroll to bottom
        await self._safe_evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await self.standard_wait(2.0)
        print("✅ Scrolling complete")
        
    async def extract_job_data(self) -> List[Dict[str, Any]]:
        """
        Extract job data from loaded job cards
        
        Returns:
            List of job dictionaries with title, company, location, url
        """
        jobs: List[Dict[str, Any]] = []
        seen_links: Set[str] = set()
        
        print("🔍 Extracting job data...")
        page = self.active_page
        
        # Try multiple selectors for job cards
        job_card_selectors = [
            "li.jobs-search-results__list-item",
            "div.scaffold-layout__list-item",
            "div.job-card-container",
            "li[class*='job']"
        ]
        
        job_cards = []
        for selector in job_card_selectors:
            try:
                cards = await page.query_selector_all(selector)
                if cards:
                    job_cards = cards
                    print(f"✅ Found {len(job_cards)} job cards using selector: {selector}")
                    break
            except:
                continue
                
        if not job_cards:
            print("⚠️  No job cards found")
            return jobs
            
        for idx, card in enumerate(job_cards):
            try:
                # Extract job title and link
                title = None
                job_url = None
                
                # Try multiple selectors for title/link
                title_selectors = [
                    "a.job-card-list__title",
                    "a.job-card-container__link",
                    "a[class*='job-card']",
                    "h3.job-card-list__title a",
                    "a[data-control-name*='job']"
                ]
                
                for sel in title_selectors:
                    try:
                        link_el = await card.query_selector(sel)
                        if link_el:
                            title = await link_el.inner_text()
                            job_url = await link_el.get_attribute("href")
                            if title and job_url:
                                break
                    except Exception:
                        continue
                        
                if not title or not job_url:
                    continue
                    
                # Make URL absolute
                if not job_url.startswith("http"):
                    job_url = f"https://www.linkedin.com{job_url}"
                    
                # Deduplicate by URL
                if job_url in seen_links:
                    continue
                    
                # Extract company name
                company = "Unknown Company"
                company_selectors = [
                    "h4.job-card-container__company-name",
                    "span.job-card-container__company-name",
                    "a.job-card-container__company-name",
                    "div[class*='company-name']",
                    "h4[class*='company']"
                ]
                
                for sel in company_selectors:
                    try:
                        company_el = await card.query_selector(sel)
                        if company_el:
                            company = await company_el.inner_text()
                            if company:
                                break
                    except Exception:
                        continue
                        
                # Extract location
                location = "Unknown Location"
                location_selectors = [
                    "span.job-card-container__metadata-item",
                    "li.job-card-container__metadata-item",
                    "div[class*='location']",
                    "span[class*='location']"
                ]
                
                for sel in location_selectors:
                    try:
                        location_el = await card.query_selector(sel)
                        if location_el:
                            loc_text = await location_el.inner_text()
                            if loc_text and loc_text.strip():
                                location = loc_text
                                break
                    except Exception:
                        continue
                        
                # Add to results
                seen_links.add(job_url)
                jobs.append({
                    "title": title.strip(),
                    "company": company.strip(),
                    "location": location.strip(),
                    "url": job_url,
                    "index": idx + 1
                })
                
            except Exception as e:
                print(f"⚠️  Error extracting job {idx + 1}: {str(e)}")
                continue
                
        print(f"✅ Extracted {len(jobs)} unique jobs")
        return jobs
        
    async def fetch_recommended_jobs(self) -> List[Dict[str, str]]:
        """
        Main method to fetch all recommended jobs
        
        Returns:
            List of job dictionaries
        """
        try:
            # Initialize
            await self.initialize_browser()
            
            # Login
            if not await self.login_to_linkedin():
                raise RuntimeError("Login failed (invalid credentials or LinkedIn checkpoint)")

            # Defensive: if LinkedIn redirected back to login/authwall, stop early.
            current_url = self.page.url if (self.page and not self.page.is_closed()) else ""
            if (not self._is_logged_in_url(current_url)) or self._is_checkpoint_url(current_url) or ("/login" in (current_url or "")):
                raise RuntimeError(f"Login not confirmed (current URL: {current_url})")
                
            # Navigate to recommended jobs
            if not await self.navigate_to_recommended_jobs():
                raise RuntimeError("Navigation to recommended jobs failed")
                
            # Scroll and load all jobs
            await self.scroll_and_load_jobs(scroll_iterations=8)
            
            # Extract job data
            jobs = await self.extract_job_data()
            
            return jobs
            
        except Exception as e:
            print(f"❌ Error fetching recommended jobs: {str(e)}")
            raise
            
        finally:
            # Cleanup
            if self.browser:
                print("\n🧹 Cleaning up...")
                try:
                    await self.browser.close()
                except Exception as e:
                    print(f"⚠️  Browser cleanup warning: {str(e)}")
                    
            if self.playwright:
                try:
                    await self.playwright.stop()
                except Exception as e:
                    print(f"⚠️  Playwright cleanup warning: {str(e)}")
                    
            print("✅ Cleanup complete")


async def fetch_recommended_jobs() -> List[Dict[str, Any]]:
    """
    Convenience function to fetch recommended jobs using persistent session.
    
    Returns:
        List of job dictionaries
    """
    scraper = LinkedInRecommendedJobsScraper()
    return await scraper.fetch_recommended_jobs()


# Test function
async def main():
    """Test the scraper"""
    jobs = await fetch_recommended_jobs()
    print(f"\n{'='*60}")
    print(f"TOTAL JOBS FOUND: {len(jobs)}")
    print(f"{'='*60}\n")
    
    for job in jobs[:5]:  # Show first 5
        print(f"Title: {job['title']}")
        print(f"Company: {job['company']}")
        print(f"Location: {job['location']}")
        print(f"URL: {job['url']}")
        print("-" * 60)


if __name__ == "__main__":
    asyncio.run(main())
