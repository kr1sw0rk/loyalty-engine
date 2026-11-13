#!/usr/bin/env python3
"""Load crawled data into Cloudflare D1."""

import json
import os
import glob

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
CRAWLED_DIR = os.path.join(DATA_DIR, "crawled")

def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

# Find the most recent crawled file
crawled_files = sorted(glob.glob(os.path.join(CRAWLED_DIR, "crawled_*.json")))
if not crawled_files:
    print("No crawled files found!")
    exit(1)

with open(crawled_files[-1]) as f:
    records = json.load(f)

print(f"Loading {len(records)} crawled records from {os.path.basename(crawled_files[-1])}")

sql = ["INSERT INTO crawled_data (company_name, program_name, sector, region, program_url, estimated_members, crawl_status, crawl_error, html_length, text_preview, crawled_at) VALUES"]
values = []
for r in records:
    vals = [
        escape_sql(r.get("company_name")),
        escape_sql(r.get("program_name")),
        escape_sql(r.get("sector")),
        escape_sql(r.get("region")),
        escape_sql(r.get("program_url")),
        str(r.get("estimated_members")) if r.get("estimated_members") else "NULL",
        str(r.get("crawl_status", 0)),
        escape_sql(r.get("crawl_error")),
        str(r.get("html_length", 0)),
        escape_sql(r.get("text_preview", "")[:500]),
        escape_sql(r.get("crawled_at")),
    ]
    values.append(f"({', '.join(vals)})")

sql.append(",\n".join(values) + ";")
sql_text = "\n".join(sql)

output_file = os.path.join(DATA_DIR, "load_crawled.sql")
with open(output_file, "w") as f:
    f.write(sql_text)

print(f"SQL written: {len(sql_text)} bytes -> {output_file}")
