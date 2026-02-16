#!/usr/bin/env python3
"""
X (Twitter) Job Search Tool - Skill.
Uses RAPIDAPI_KEY from this skill folder's .env.
Invoke from skill dir: python3 x_jobs_tool.py search --keyword "..." [options]
"""
import os
import sys
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).parent.resolve()
load_dotenv(SCRIPT_DIR / ".env")


def load_api_key():
    return os.environ.get("RAPIDAPI_KEY")


def search_jobs(
    keyword,
    location_type="remote,onsite,hybrid",
    location_id="",
    seniority_level="intern,entry_level,junior,mid_level,senior,lead,manager",
    employment_type="full_time,part_time,full_time_contract,contract_to_hire",
    company_name="",
    cursor="",
):
    api_key = load_api_key()
    if not api_key:
        return {
            "error": "RAPIDAPI_KEY not found",
            "hint": "Add RAPIDAPI_KEY=your_key to this skill folder's .env",
        }

    url = "https://twitter303.p.rapidapi.com/twitter/api/job/Search/"
    headers = {
        "Content-Type": "application/json",
        "x-rapidapi-host": "twitter303.p.rapidapi.com",
        "x-rapidapi-key": api_key,
    }
    payload = {
        "keyword": keyword,
        "location_id": location_id,
        "location_type": location_type,
        "seniority_level": seniority_level,
        "employment_type": employment_type,
        "company_name": company_name,
        "cursor": cursor,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        try:
            data = response.json()
        except Exception:
            data = {"text": response.text}
        return {"status_code": response.status_code, "success": response.ok, "data": data}
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "url": url}


def format_jobs(response):
    if not response.get("success"):
        return response
    data = response.get("data", {})
    job_search = data.get("data", {}).get("job_search", {})
    items = job_search.get("items_results", [])

    jobs = []
    for item in items:
        result = item.get("result", {})
        core = result.get("core", {})
        company_result = result.get("company_profile_results", {}).get("result", {})
        company_core = company_result.get("core", {})
        user_result = result.get("user_results", {}).get("result", {})
        user_core = user_result.get("core", {})

        jobs.append({
            "title": core.get("title", "N/A"),
            "company": company_core.get("name", "N/A"),
            "location": core.get("location", "N/A"),
            "salary": core.get("formatted_salary", "Not specified"),
            "url": core.get("redirect_url", "N/A"),
            "twitter_handle": user_core.get("screen_name", "N/A"),
        })

    return {
        "total_results": len(jobs),
        "jobs": jobs,
        "cursor": job_search.get("cursor"),
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python3 x_jobs_tool.py search --keyword <keyword> [options]",
            "options": {
                "--keyword": "Job title or keyword (required)",
                "--location-type": "remote, onsite, hybrid (comma-separated)",
                "--seniority": "Seniority levels (comma-separated)",
                "--employment": "Employment types (comma-separated)",
                "--company": "Company name filter",
                "--cursor": "Pagination cursor",
                "--format": "Output format: json (default) or pretty",
            },
        }, indent=2))
        sys.exit(1)

    command = sys.argv[1]
    if command != "search":
        print(json.dumps({"error": f"Unknown command: {command}. Use 'search'"}))
        sys.exit(1)

    keyword = None
    location_type = "remote,onsite,hybrid"
    location_id = ""
    seniority = "intern,entry_level,junior,mid_level,senior,lead,manager"
    employment = "full_time,part_time,full_time_contract,contract_to_hire"
    company = ""
    cursor = ""
    output_format = "json"

    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--keyword" and i + 1 < len(sys.argv):
            keyword = sys.argv[i + 1]
            i += 2
        elif arg == "--location-type" and i + 1 < len(sys.argv):
            location_type = sys.argv[i + 1]
            i += 2
        elif arg == "--location-id" and i + 1 < len(sys.argv):
            location_id = sys.argv[i + 1]
            i += 2
        elif arg == "--seniority" and i + 1 < len(sys.argv):
            seniority = sys.argv[i + 1]
            i += 2
        elif arg == "--employment" and i + 1 < len(sys.argv):
            employment = sys.argv[i + 1]
            i += 2
        elif arg == "--company" and i + 1 < len(sys.argv):
            company = sys.argv[i + 1]
            i += 2
        elif arg == "--cursor" and i + 1 < len(sys.argv):
            cursor = sys.argv[i + 1]
            i += 2
        elif arg == "--format" and i + 1 < len(sys.argv):
            output_format = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    if not keyword:
        print(json.dumps({"error": "--keyword is required"}))
        sys.exit(1)

    response = search_jobs(
        keyword=keyword,
        location_type=location_type,
        location_id=location_id,
        seniority_level=seniority,
        employment_type=employment,
        company_name=company,
        cursor=cursor,
    )

    result = format_jobs(response)
    if output_format == "pretty" and "jobs" in result:
        print(f"\nFound {result['total_results']} jobs matching '{keyword}':\n")
        for i, job in enumerate(result["jobs"], 1):
            print(f"{i}. {job['title']}")
            print(f"   Company: {job['company']} (@{job['twitter_handle']})")
            print(f"   Location: {job['location']}")
            print(f"   Salary: {job['salary']}")
            print(f"   Apply: {job['url']}")
            print()
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
