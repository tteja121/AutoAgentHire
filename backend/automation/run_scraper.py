import sys
import os
import asyncio
import json

# Ensure project root is in sys.path so both `automation.*` and `backend.*` imports resolve.
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from backend.automation.linkedin_recommended_jobs import fetch_recommended_jobs

async def main():
    if sys.platform == 'win32' and sys.version_info < (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
    try:
        # Reuses existing browser profile session - no credentials needed
        jobs = await fetch_recommended_jobs()
        print("\n---JSON_OUTPUT_START---")
        print(json.dumps(jobs))
        print("---JSON_OUTPUT_END---\n")
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    if sys.platform == 'win32':
        with asyncio.Runner(loop_factory=asyncio.ProactorEventLoop) as runner:
            runner.run(main())
    else:
        asyncio.run(main())
