# Loyalty Engine MCP — Client Configuration

## MCP Server (SSE transport)
**URL:** `https://loyalty.digid.cc/mcp/sse`
**Message endpoint:** `https://loyalty.digid.cc/mcp/message`
**Auth:** `X-API-Key: <YOUR_KEY>` header (or `Authorization: Bearer <YOUR_KEY>`)

## API Key
Stored in 1Password vault "digid pay" → "Loyalty Engine Ingestion API Key"

## Tools Available
- `create_provider` — Create a single loyalty program provider
- `create_normalized` — Create a normalized program record with extracted fields
- `bulk_providers` — Create multiple providers at once

## REST Endpoints (Write)
- `POST /api/providers` — Create provider (requires key)
- `POST /api/normalized` — Create normalized record (requires key)
- `POST /api/providers/bulk` — Bulk insert (requires key)

## REST Endpoints (Read — public)
- `GET /api/stats` — Counts + sector breakdown
- `GET /api/providers?sector=&region=&search=&limit=` — List providers
- `GET /api/parameters?category=&search=` — List parameters
- `GET /api/normalized?sector=&enriched=&limit=` — List normalized records
- `GET /api/crawled` — List crawled HTML records

## Example: MCP initialize
```bash
curl -X POST https://loyalty.digid.cc/mcp/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <YOUR_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}'
```

## Example: Create provider via MCP
```bash
curl -X POST https://loyalty.digid.cc/mcp/message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <YOUR_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_provider","arguments":{"company_name":"Delta Air Lines","program_name":"SkyMiles","sector":"airline","region":"north_america","estimated_members":100000000}}}'
```

## Example: Bulk insert via REST
```bash
curl -X POST https://loyalty.digid.cc/api/providers/bulk \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <YOUR_KEY>" \
  -d '{"providers":[{"company_name":"Delta","program_name":"SkyMiles","sector":"airline"},{"company_name":"United","program_name":"MileagePlus","sector":"airline"}]}'
```
