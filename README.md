# Loyalty Engine — POC

A proof-of-concept fork of the **Calculation Engine** focused on global loyalty programs.

## Scope

This POC collects and benchmarks loyalty programs across:
- Airlines (AAdvantage, SkyMiles, Flying Blue, Avios, etc.)
- Hotels (Hilton Honors, Marriott Bonvoy, World of Hyatt, IHG One, etc.)
- Car Rental (Hertz Gold Plus, Avis Preferred, National Emerald, etc.)
- Credit Cards (Chase Ultimate Rewards, Amex MR, Capital One Miles, etc.)
- Retail (Starbucks, Sephora Beauty Insider, Target Circle, etc.)
- Dining, Fuel, Entertainment, and other categories

## Outputs

This POC delivers two structured JSON arrays for the calculation engine:

1. **`loyalty_parameters.json`** — 77 parameters defining loyalty program characteristics for benchmark modeling
2. **`loyalty_providers.json`** — 168 global loyalty program providers across 9 sectors for seed crawling

## Parameters (77)

Covers program identity, tier structure, earning mechanics, redemption rules,
point economics, digital capabilities, co-branding, elite benefits, and business metrics.

## Providers (168)

- Airlines: 40
- Hotels: 14
- Car Rental: 8
- Credit Cards: 15
- Retail: 39
- Dining: 16
- Fuel: 12
- Entertainment: 15
- Other: 9

## Next Steps

1. Invoke a commercial crawler (ScrapingBee, Zyte, etc.) to crawl program data
2. Use LLM analysis to extract structured records from crawled pages
3. Run scoring models to compute derived index scores
4. Expose recommendation API for user best-fit lookups
