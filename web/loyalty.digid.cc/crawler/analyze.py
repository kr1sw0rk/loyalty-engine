#!/usr/bin/env python3
"""Extract structured loyalty program data from crawled text using LLM.

Usage: python3 analyze.py [crawled_file]
"""

import json
import os
import sys
import urllib.request
from datetime import datetime

# MiMo API for LLM analysis
MIMO_API_URL = "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions"
MIMO_API_KEY = os.environ.get("MIMO_API_KEY", "")

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OUTPUT_DIR = os.path.join(DATA_DIR, "normalized")

def load_parameters():
    with open(os.path.join(DATA_DIR, "loyalty_parameters.json")) as f:
        return json.load(f)

def analyze_with_llm(text_preview, parameters, company_name, program_name):
    """Use LLM to extract structured fields from crawled text."""
    
    param_summary = "\n".join([
        f"- {p['id']} ({p['category']}): {p['description'][:80]}"
        for p in parameters[:20]  # Top 20 params for context
    ])
    
    prompt = f"""Extract loyalty program data from this text about {company_name} ({program_name}).

Text:
{text_preview[:3000]}

Extract these fields (return JSON only, use null for unknown):
- program_name: official program name
- tier_count: number of tiers
- tier_names: comma-separated tier names
- miles_expiry: expiration policy
- award_pricing: "dynamic" or "fixed"
- earn_rate: earning rate per dollar
- credit_card_partners: co-branded credit card partners
- alliance: airline alliance or hotel group
- points_currency: points/miles currency name
- best_redemption: best value redemption type

Return ONLY valid JSON, no explanation."""

    if not MIMO_API_KEY:
        # Fallback: extract what we can with regex
        return extract_with_regex(text_preview, company_name, program_name)
    
    try:
        req = urllib.request.Request(
            MIMO_API_URL,
            data=json.dumps({
                "model": "mimo-v2.6-flash",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 500,
            }).encode(),
            headers={
                "Authorization": f"Bearer {MIMO_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read().decode())
        content = result["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        print(f"    LLM error: {e}")
        return extract_with_regex(text_preview, company_name, program_name)

def extract_with_regex(text, company_name, program_name):
    """Fallback extraction using regex patterns."""
    import re
    result = {
        "program_name": program_name,
        "tier_count": None,
        "tier_names": None,
        "miles_expiry": None,
        "award_pricing": None,
        "earn_rate": None,
        "credit_card_partners": None,
        "alliance": None,
        "points_currency": None,
        "best_redemption": None,
    }
    
    # Detect tier names
    tier_patterns = [
        r"(Bronze|Silver|Gold|Platinum|Diamond|Emerald|Ruby|Sapphire|Onyx|Titanium)",
        r"(Basic|Standard|Plus|Premium|Elite|Premier|Executive|Chairman|Globalist)",
    ]
    tiers = set()
    for pattern in tier_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            tiers.add(match.group().capitalize())
    if tiers:
        result["tier_count"] = len(tiers)
        result["tier_names"] = ", ".join(sorted(tiers))
    
    # Detect expiration
    if re.search(r"never expire|no expiration|do not expire", text, re.IGNORECASE):
        result["miles_expiry"] = "never"
    elif re.search(r"expire|expiration", text, re.IGNORECASE):
        result["miles_expiry"] = "yes"
    
    # Detect pricing
    if re.search(r"dynamic award pricing|dynamic pricing", text, re.IGNORECASE):
        result["award_pricing"] = "dynamic"
    elif re.search(r"fixed award|standard award", text, re.IGNORECASE):
        result["award_pricing"] = "fixed"
    
    # Detect alliance
    alliances = ["oneworld", "SkyTeam", "Star Alliance", "Marriott Bonvoy", "Hilton Honors", "World of Hyatt"]
    for a in alliances:
        if a.lower() in text.lower():
            result["alliance"] = a
            break
    
    # Detect credit card partners
    cards = ["American Express", "Chase", "Citi", "Capital One", "Barclays", "Bank of America"]
    found_cards = [c for c in cards if c.lower() in text.lower()]
    if found_cards:
        result["credit_card_partners"] = ", ".join(found_cards)
    
    return result

def main():
    crawled_file = sys.argv[1] if len(sys.argv) > 1 else None
    
    if not crawled_file:
        import glob
        files = sorted(glob.glob(os.path.join(DATA_DIR, "crawled", "crawled_*.json")))
        if not files:
            print("No crawled files found!")
            return
        crawled_file = files[-1]
    
    print(f"Analyzing: {os.path.basename(crawled_file)}")
    
    with open(crawled_file) as f:
        records = json.load(f)
    
    parameters = load_parameters()
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    normalized = []
    for i, record in enumerate(records):
        if record.get("crawl_status") != 200:
            print(f"  [{i+1}/{len(records)}] SKIP {record['company_name']} (status {record.get('crawl_status')})")
            continue
        
        print(f"  [{i+1}/{len(records)}] Analyzing {record['company_name']}...")
        fields = analyze_with_llm(
            record.get("text_preview", ""),
            parameters,
            record["company_name"],
            record["program_name"],
        )
        
        normalized.append({
            "company_name": record["company_name"],
            "program_name": record["program_name"],
            "sector": record.get("sector"),
            "region": record.get("region"),
            "estimated_members": record.get("estimated_members"),
            **fields,
            "analyzed_at": datetime.utcnow().isoformat() + "Z",
        })
    
    output_file = os.path.join(OUTPUT_DIR, f"normalized_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(output_file, "w") as f:
        json.dump(normalized, f, indent=2)
    
    print(f"\nDone! Normalized {len(normalized)} records.")
    print(f"Output: {output_file}")

if __name__ == "__main__":
    main()
