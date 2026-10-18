"""
AutoAgentHire - Promotional Demo Video Recorder
Uses Playwright to record a high-definition 30-45 second video of the live platform.
"""
import os
import time
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
DEMO_DIR = ROOT_DIR / "demo"
PUBLIC_DEMO_DIR = ROOT_DIR / "frontend" / "public" / "demo"
TEMP_RECORD_DIR = DEMO_DIR / "temp_recordings"

DEMO_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DEMO_DIR.mkdir(parents=True, exist_ok=True)
TEMP_RECORD_DIR.mkdir(parents=True, exist_ok=True)

FINAL_WEBM_PATH = DEMO_DIR / "autoagenthire_demo.webm"
PUBLIC_WEBM_PATH = PUBLIC_DEMO_DIR / "autoagenthire_demo.webm"


def inject_title_card(page, title, subtitle, duration_sec=4):
    """Inject a professional animated motion-graphic card into the viewport."""
    page.evaluate(f"""() => {{
        const existing = document.getElementById('promo-overlay-card');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'promo-overlay-card';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 999999;
            background: radial-gradient(circle at 50% 30%, #0d1b2a 0%, #030712 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #ffffff;
            opacity: 0;
            transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            box-shadow: inset 0 0 100px rgba(0, 114, 255, 0.15);
        `;

        overlay.innerHTML = `
            <div style="text-align: center; max-width: 800px; padding: 40px;">
                <div style="width: 84px; height: 84px; margin: 0 auto 24px; border-radius: 24px; background: linear-gradient(135deg, #0072ff, #00c6ff); display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 40px rgba(0, 114, 255, 0.45);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 8V4H8"></path>
                        <rect width="16" height="12" x="4" y="8" rx="2"></rect>
                        <path d="M2 14h2"></path>
                        <path d="M20 14h2"></path>
                        <path d="M15 13v2"></path>
                        <path d="M9 13v2"></path>
                    </svg>
                </div>
                <div style="display: inline-block; padding: 6px 16px; border-radius: 999px; background: rgba(0, 114, 255, 0.15); border: 1px solid rgba(0, 114, 255, 0.3); color: #60a5fa; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px;">
                    Autonomous AI Recruitment Platform
                </div>
                <h1 style="font-size: 48px; font-weight: 800; margin: 0 0 16px; background: linear-gradient(135deg, #ffffff 40%, #93c5fd 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -1px;">
                    {title}
                </h1>
                <p style="font-size: 20px; color: #94a3b8; margin: 0; line-height: 1.5; font-weight: 400;">
                    {subtitle}
                </p>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => {{
            overlay.style.opacity = '1';
        }});
    }}""")
    time.sleep(duration_sec)
    page.evaluate("""() => {
        const overlay = document.getElementById('promo-overlay-card');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 600);
        }
    }""")
    time.sleep(0.6)


def inject_scene_badge(page, text):
    """Display a floating lower-third scene badge during walkthrough."""
    page.evaluate(f"""() => {{
        const existing = document.getElementById('promo-scene-badge');
        if (existing) existing.remove();

        const badge = document.createElement('div');
        badge.id = 'promo-scene-badge';
        badge.style.cssText = `
            position: fixed;
            bottom: 28px;
            left: 32px;
            z-index: 99999;
            background: rgba(13, 27, 42, 0.88);
            border: 1px solid rgba(59, 130, 246, 0.4);
            backdrop-filter: blur(12px);
            padding: 10px 20px;
            border-radius: 999px;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            animation: fadeInBadge 0.4s ease forwards;
        `;
        badge.innerHTML = `
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 10px #3b82f6;"></span>
            <span>{text}</span>
        `;
        document.body.appendChild(badge);
    }}""")


def smooth_scroll(page, y_start, y_end, steps=25, delay=0.03):
    """Smooth scrolling simulation for video."""
    step_diff = (y_end - y_start) / steps
    for i in range(steps):
        curr = y_start + step_diff * (i + 1)
        page.evaluate(f"window.scrollTo(0, {curr})")
        time.sleep(delay)


def record():
    print("=" * 60)
    print("AutoAgentHire - Recording Promotional Walkthrough Video")
    print("=" * 60)

    # Clean old temp files
    for f in TEMP_RECORD_DIR.glob("*.webm"):
        try:
            f.unlink()
        except Exception:
            pass

    with sync_playwright() as p:
        # Launch browser with 1920x1080 viewport and video recording enabled
        browser = p.chromium.launch(
            headless=True,
            args=["--start-maximized", "--disable-gpu", "--no-sandbox"]
        )

        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=str(TEMP_RECORD_DIR),
            record_video_size={"width": 1920, "height": 1080},
        )

        page = context.new_page()

        # -------------------------------------------------------------
        # SCENE 1: Brand Opening Title Card (0s - 4.5s)
        # -------------------------------------------------------------
        print("[Scene 1/5] Opening Title & Brand Identity...")
        page.goto("http://127.0.0.1:5173/")
        page.wait_for_load_state("networkidle")
        inject_title_card(
            page,
            title="AutoAgentHire",
            subtitle="Autonomous AI-Powered Job Discovery, ATS Scoring & Hiring Ecosystem",
            duration_sec=3.8
        )

        # -------------------------------------------------------------
        # SCENE 2: Landing Page & Job Search Experience (4.5s - 14s)
        # -------------------------------------------------------------
        print("[Scene 2/5] Homepage & Live Job Search...")
        inject_scene_badge(page, "Smart Landing Experience & AI Features")
        time.sleep(1.2)
        # Scroll down through hero features & choose your plan
        smooth_scroll(page, 0, 750, steps=20, delay=0.04)
        time.sleep(1.2)
        smooth_scroll(page, 750, 1600, steps=25, delay=0.04)
        time.sleep(1.5)

        # Navigate to Browse Jobs
        inject_scene_badge(page, "Browse Jobs • Real-Time AI Match Engine")
        page.goto("http://127.0.0.1:5173/candidate/jobs")
        page.wait_for_load_state("networkidle")
        time.sleep(1.0)
        smooth_scroll(page, 0, 500, steps=15, delay=0.03)
        time.sleep(1.5)

        # -------------------------------------------------------------
        # SCENE 3: Candidate Sign-in & Dashboard (14s - 25s)
        # -------------------------------------------------------------
        print("[Scene 3/5] Candidate Sign-in & Dashboard Analytics...")
        page.goto("http://127.0.0.1:5173/login")
        page.wait_for_load_state("networkidle")
        inject_scene_badge(page, "Unified Login • Role-Based Access Control")
        time.sleep(1.0)

        # Type in demo credentials smoothly
        email_input = page.locator("input[type='text'], input[placeholder*='email' i]").first
        if email_input.is_visible():
            email_input.click()
            email_input.press_sequentially("alex.candidate@demo.io", delay=35)
            time.sleep(0.5)

        # Inject authenticated candidate session into localStorage for instant real dashboard access
        page.evaluate("""() => {
            localStorage.setItem('authToken', 'demo_verified_jwt_token_2026');
            localStorage.setItem('userRole', 'candidate');
            localStorage.setItem('userEmail', 'alex.candidate@demo.io');
            localStorage.setItem('userName', 'Alex Morgan');
        }""")

        page.goto("http://127.0.0.1:5173/dashboard")
        page.wait_for_load_state("networkidle")
        inject_scene_badge(page, "Candidate Hub • ATS Diagnostics & Applications")
        time.sleep(1.5)
        smooth_scroll(page, 0, 450, steps=15, delay=0.03)
        time.sleep(1.5)

        # View Applications Tracker
        page.goto("http://127.0.0.1:5173/dashboard/applications")
        page.wait_for_load_state("networkidle")
        inject_scene_badge(page, "Application Tracker • Status Pipeline")
        time.sleep(1.5)
        smooth_scroll(page, 0, 400, steps=15, delay=0.03)
        time.sleep(1.5)

        # -------------------------------------------------------------
        # SCENE 4: Recruiter Management Portal (25s - 34s)
        # -------------------------------------------------------------
        print("[Scene 4/5] Recruiter Portal & Candidate Review...")
        page.evaluate("""() => {
            localStorage.setItem('authToken', 'demo_recruiter_jwt_token_2026');
            localStorage.setItem('userRole', 'recruiter');
            localStorage.setItem('userName', 'Sarah Jenkins');
            localStorage.setItem('recruiterId', 'REC-1001');
        }""")
        page.goto("http://127.0.0.1:5173/recruiter")
        page.wait_for_load_state("networkidle")
        inject_scene_badge(page, "Recruiter Portal • Vacancies & Candidate Review")
        time.sleep(1.5)
        smooth_scroll(page, 0, 500, steps=18, delay=0.03)
        time.sleep(2.0)

        # -------------------------------------------------------------
        # SCENE 5: Closing Title Card (34s - 40s)
        # -------------------------------------------------------------
        print("[Scene 5/5] Cinematic Closing...")
        page.goto("http://127.0.0.1:5173/")
        inject_title_card(
            page,
            title="AutoAgentHire",
            subtitle="Connecting Talent with Opportunity.\n\nLive on Vercel: auto-agent-hire.vercel.app",
            duration_sec=4.5
        )

        # Close page and context to flush video to disk
        page.close()
        context.close()
        browser.close()

    # Find the recorded WebM file
    recorded_files = list(TEMP_RECORD_DIR.glob("*.webm"))
    if not recorded_files:
        print("[ERROR] No video file was generated by Playwright.")
        return False

    latest_video = max(recorded_files, key=lambda f: f.stat().st_mtime)
    print(f"Recorded raw video: {latest_video} ({latest_video.stat().st_size / 1024 / 1024:.2f} MB)")

    # Copy to project demo directories
    shutil.copy2(latest_video, FINAL_WEBM_PATH)
    shutil.copy2(latest_video, PUBLIC_WEBM_PATH)

    print(f"[SUCCESS] Video exported to project: {FINAL_WEBM_PATH}")
    print(f"[SUCCESS] Video copied to public web root: {PUBLIC_WEBM_PATH}")
    print(f"File size: {FINAL_WEBM_PATH.stat().st_size / 1024 / 1024:.2f} MB")
    return True


if __name__ == "__main__":
    record()
