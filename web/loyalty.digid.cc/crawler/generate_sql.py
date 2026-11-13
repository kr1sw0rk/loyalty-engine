#!/usr/bin/env python3
"""Load loyalty data into Cloudflare D1 via SQL export."""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def load_providers():
    with open(os.path.join(DATA_DIR, "loyalty_providers.json")) as f:
        providers = json.load(f)
    
    sql = ["INSERT INTO providers (company_name, program_name, program_url, sector, region, estimated_members, key_characteristics) VALUES"]
    values = []
    for p in providers:
        members = p.get("estimated_members")
        vals = [
            escape_sql(p.get("company_name")),
            escape_sql(p.get("program_name")),
            escape_sql(p.get("program_url")),
            escape_sql(p.get("sector")),
            escape_sql(p.get("region")),
            str(members) if members else "NULL",
            escape_sql(p.get("key_characteristics")),
        ]
        values.append(f"({', '.join(vals)})")
    
    sql.append(",\n".join(values) + ";")
    return "\n".join(sql)

def load_parameters():
    with open(os.path.join(DATA_DIR, "loyalty_parameters.json")) as f:
        params = json.load(f)
    
    sql = ["INSERT INTO parameters (param_id, name, category, description, data_type, benchmark_notes) VALUES"]
    values = []
    for p in params:
        vals = [
            escape_sql(p.get("id")),
            escape_sql(p.get("name")),
            escape_sql(p.get("category")),
            escape_sql(p.get("description")),
            escape_sql(p.get("data_type")),
            escape_sql(p.get("benchmark_notes")),
        ]
        values.append(f"({', '.join(vals)})")
    
    sql.append(",\n".join(values) + ";")
    return "\n".join(sql)

# Generate SQL files
providers_sql = load_providers()
params_sql = load_parameters()

with open(os.path.join(DATA_DIR, "load_providers.sql"), "w") as f:
    f.write(providers_sql)

with open(os.path.join(DATA_DIR, "load_parameters.sql"), "w") as f:
    f.write(params_sql)

print(f"Providers SQL: {len(providers_sql)} bytes")
print(f"Parameters SQL: {len(params_sql)} bytes")
