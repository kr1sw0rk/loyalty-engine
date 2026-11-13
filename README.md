# Loyalty Engine (POC)

POC fork of the Calculation Engine focused on global loyalty programs.

## Scope

Collection, benchmarking, and recommendation for loyalty programs across:
- Airlines
- Hotels  
- Car rental
- Credit cards
- Retail brands
- Dining, fuel, entertainment

## POC Outputs

### 1. Parameter Array (`loyalty_parameters.json`)
Identified parameters for benchmarking loyalty programs (from deep research).

### 2. Seed Crawling Array (`loyalty_providers.json`)
Provider list for initial data collection (from deep research).

## Architecture

Inherits generic core from parent repository:
- Ingestion → LLM Analysis → Normalization → Scoring → Recommendation

POC-specific additions:
- Loyalty program scoring models (value index, tier accessibility, earning potential)
- Sector-specific crawler configurations
- Loyalty domain vectorization

## Data Collection

Next phase: Invoke commercial crawler using seed array to collect program data.
