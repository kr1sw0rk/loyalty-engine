#!/usr/bin/env python3
"""ScrapingBee crawler for loyalty program providers.

Usage: python3 crawl.py [num_providers]
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime

SCRAPINGBEE_KEY = os.environ.get("SCRAPINGBEE_API_KEY", "G5599BEMNQJI6AKGYOECL6V8K8WSED2SI5X448C2PYI1UL5B2Q4PLJ30ZDYN9NF5MG6RVW61F2OPQLMJ")
SCRAPINGBEE_URL = "https://app.scrapingbee.com/api/v1/"

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OUTPUT_DIR = os.path.join(DATA_DIR, "crawled")

def load_providers(num_providers=None):
    with open(os.path.join(DATA_DIR, "loyalty_providers.json")) as f:
        providers = json.load(f)
    providers.sort(key=lambda x: x.get("estimated_members", 0) or 0, reverse=True)
    if num_providers:
        providers = providers[:num_providers]
    return providers

def crawl_url(url, timeout=30):
    """Fetch a URL via ScrapingBee."""
    params = {
        "api_key": SCRAPINGBEE_KEY,
        "url": url,
        "render_js": "false",
        "premium_proxy": "true",
        "country_code": "us",
    }
    query = urllib.parse.urlencode(params)
    full_url = f"{SCRAPINGBEE_URL}?{query}"
    
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        content = resp.read().decode("utf-8", errors="replace")
        status = resp.status
        return {"status": status, "content": content, "url": url}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "content": "", "url": url, "error": str(e)}
    except Exception as e:
        return {"status": 0, "content": "", "url": url, "error": str(e)}

def extract_text(html, max_chars=5000):
    """Extract visible text from HTML (rough)."""
    import re
    # Remove script/style
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]

def crawl_providers(providers):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []
    
    for i, provider in enumerate(providers):
        url = provider.get("program_url", "")
        if not url:
            continue
        
        print(f"[{i+1}/{len(providers)}] Crawling {provider['company_name']} ({provider['program_name']})...")
        print(f"  URL: {url}")
        
        result = crawl_url(url)
        
        record = {
            "company_name": provider["company_name"],
            "program_name": provider["program_name"],
            "sector": provider.get("sector", ""),
            "region": provider.get("region", ""),
            "program_url": url,
            "estimated_members": provider.get("estimated_members"),
            "crawl_status": result["status"],
            "crawl_error": result.get("error"),
            "html_length": len(result.get("content", "")),
            "text_preview": extract_text(result.get("content", ""), 2000),
            "crawled_at": datetime.utcnow().isoformat() + "Z",
        }
        
        results.append(record)
        
        # Save incrementally
        output_file = os.path.join(OUTPUT_DIR, f"crawled_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        
        print(f"  Status: {result['status']}, Content: {result.get('html_length', len(result.get('content','')))} chars")
        
        # Rate limit - ScrapingBee free tier: 1 credit per request
        time.sleep(1)
    
    return results

def main():
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    print(f"Crawling top {num} providers by member count...")
    
    providers = load_providers(num)
    results = crawl_providers(providers)
    
    print(f"\nDone! Crawled {len(results)} providers.")
    print(f"Output: {os.path.join(OUTPUT_DIR, 'crawled_*.json')}")
    
    # Summary
    successful = [r for r in results if r["crawl_status"] == 200]
    print(f"Successful: {len(successful)}/{len(results)}")

if __name__ == "__main__":
    main()
