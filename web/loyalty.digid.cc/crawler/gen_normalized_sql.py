import json, os, glob

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
files = sorted(glob.glob(os.path.join(DATA_DIR, "normalized", "normalized_*.json")))
with open(files[-1]) as f:
    records = json.load(f)

def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

values = []
for r in records:
    # Map to normalized_records table (provider_id resolved via company_name)
    vals = [
        esc(r.get("company_name")),
        esc(r.get("program_name")),
        esc(r.get("sector")),
        esc(r.get("region")),
        str(r.get("estimated_members")) if r.get("estimated_members") else "NULL",
        esc(r.get("tier_count")),
        esc(r.get("tier_names")),
        esc(r.get("miles_expiry")),
        esc(r.get("award_pricing")),
        esc(r.get("earn_rate")),
        esc(r.get("credit_card_partners")),
        esc(r.get("alliance")),
        esc(r.get("points_currency")),
        esc(r.get("best_redemption")),
        esc(r.get("analyzed_at")),
    ]
    values.append(f"({', '.join(vals)})")

sql = f"""INSERT INTO normalized_records_full (company_name, program_name, sector, region, estimated_members, tier_count, tier_names, miles_expiry, award_pricing, earn_rate, credit_card_partners, alliance, points_currency, best_redemption, analyzed_at) VALUES
{', '.join(values)};"""

output = os.path.join(DATA_DIR, "load_normalized.sql")
with open(output, "w") as f:
    f.write(sql)
print(f"SQL written: {len(sql)} bytes, {len(values)} records -> {output}")
