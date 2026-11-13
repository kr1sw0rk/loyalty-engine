// Loyalty Program Intelligence — Pages Advanced Worker
// Routes API requests to handlers, serves static assets via env.ASSETS
// MCP server: /mcp/sse + /mcp/message (JSON-RPC) for data ingestion
// Auth: API key required for write endpoints (POST /api/providers, /mcp/*)

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// --- API Key Auth ---
function getApiKey(request, url) {
    const auth = request.headers.get("Authorization");
    if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
    const xKey = request.headers.get("X-API-Key");
    if (xKey) return xKey;
    return url.searchParams.get("key");
}

async function requireApiKey(request, url, env) {
    const key = getApiKey(request, url);
    if (!key) return { valid: false, error: "Missing API key. Provide via Authorization: Bearer <key>, X-API-Key header, or ?key= query." };

    const validKey = env.INGESTION_API_KEY;
    if (!validKey) return { valid: false, error: "Server not configured with API key." };
    if (key !== validKey) return { valid: false, error: "Invalid API key." };
    return { valid: true };
}

// --- Read Handlers (Public) ---
async function handleStats(env) {
    const providers = await env.loyalty_engine.prepare(
        "SELECT COUNT(*) as count FROM providers"
    ).first();
    const parameters = await env.loyalty_engine.prepare(
        "SELECT COUNT(*) as count FROM parameters"
    ).first();
    const sectors = await env.loyalty_engine.prepare(
        "SELECT sector, COUNT(*) as count FROM providers GROUP BY sector ORDER BY count DESC"
    ).all();
    const crawled = await env.loyalty_engine.prepare(
        "SELECT COUNT(*) as count FROM crawled_data WHERE crawl_status = 200"
    ).first();

    return json({
        providers: providers.count,
        parameters: parameters.count,
        sectors: sectors.results,
        crawled: crawled.count,
    });
}

async function handleProviders(env, url) {
    const sector = url.searchParams.get("sector");
    const region = url.searchParams.get("region");
    const search = url.searchParams.get("search");
    const limit = parseInt(url.searchParams.get("limit") || "200");

    let query = "SELECT * FROM providers WHERE 1=1";
    const params = [];

    if (sector) { query += " AND sector = ?"; params.push(sector); }
    if (region) { query += " AND region = ?"; params.push(region); }
    if (search) {
        query += " AND (company_name LIKE ? OR program_name LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }
    query += " ORDER BY estimated_members DESC LIMIT ?";
    params.push(limit);

    const { results } = await env.loyalty_engine.prepare(query).bind(...params).all();
    return json(results);
}

async function handleParameters(env, url) {
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");

    let query = "SELECT * FROM parameters WHERE 1=1";
    const params = [];

    if (category) { query += " AND category = ?"; params.push(category); }
    if (search) {
        query += " AND (name LIKE ? OR description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }
    query += " ORDER BY category, name";

    const { results } = await env.loyalty_engine.prepare(query).bind(...params).all();
    return json(results);
}

async function handleCrawled(env) {
    const { results } = await env.loyalty_engine.prepare(
        "SELECT * FROM crawled_data ORDER BY estimated_members DESC LIMIT 50"
    ).all();
    return json(results);
}

async function handleNormalized(env, url) {
    const sector = url.searchParams.get("sector");
    const enriched = url.searchParams.get("enriched");
    const limit = parseInt(url.searchParams.get("limit") || "200");

    let query = "SELECT * FROM normalized_records_full WHERE 1=1";
    const params = [];

    if (sector) { query += " AND sector = ?"; params.push(sector); }
    if (enriched === "true") {
        query += " AND (tier_names IS NOT NULL OR alliance IS NOT NULL OR credit_card_partners IS NOT NULL)";
    }
    query += " ORDER BY estimated_members DESC LIMIT ?";
    params.push(limit);

    const { results } = await env.loyalty_engine.prepare(query).bind(...params).all();
    return json(results);
}

// --- Write Handlers (Require API Key) ---
async function handleCreateProvider(request, env) {
    const body = await request.json();
    const { company_name, program_name, program_url, sector, region, estimated_members, key_characteristics } = body;

    if (!company_name || !program_name || !sector) {
        return json({ error: "company_name, program_name, and sector are required" }, 400);
    }

    const result = await env.loyalty_engine.prepare(
        `INSERT INTO providers (company_name, program_name, program_url, sector, region, estimated_members, key_characteristics)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
    ).bind(company_name, program_name, program_url || null, sector, region || null, estimated_members || null, key_characteristics || null).first();

    return json(result, 201);
}

async function handleCreateNormalized(request, env) {
    const body = await request.json();
    const { company_name, program_name, sector, region, estimated_members, tier_count, tier_names, miles_expiry, award_pricing, earn_rate, credit_card_partners, alliance, points_currency, best_redemption } = body;

    if (!company_name) {
        return json({ error: "company_name is required" }, 400);
    }

    const result = await env.loyalty_engine.prepare(
        `INSERT INTO normalized_records_full (company_name, program_name, sector, region, estimated_members, tier_count, tier_names, miles_expiry, award_pricing, earn_rate, credit_card_partners, alliance, points_currency, best_redemption, analyzed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         RETURNING *`
    ).bind(company_name, program_name || null, sector || null, region || null, estimated_members || null, tier_count || null, tier_names || null, miles_expiry || null, award_pricing || null, earn_rate || null, credit_card_partners || null, alliance || null, points_currency || null, best_redemption || null).first();

    return json(result, 201);
}

async function handleBulkProviders(request, env) {
    const body = await request.json();
    const { providers } = body;

    if (!Array.isArray(providers) || providers.length === 0) {
        return json({ error: "providers array is required" }, 400);
    }

    const results = [];
    for (const p of providers) {
        if (!p.company_name || !p.program_name || !p.sector) continue;
        try {
            const r = await env.loyalty_engine.prepare(
                `INSERT INTO providers (company_name, program_name, program_url, sector, region, estimated_members, key_characteristics)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT DO NOTHING
                 RETURNING *`
            ).bind(p.company_name, p.program_name, p.program_url || null, p.sector, p.region || null, p.estimated_members || null, p.key_characteristics || null).first();
            if (r) results.push(r);
        } catch (e) {
            // Skip duplicates
        }
    }

    return json({ inserted: results.length, results }, 201);
}

// --- MCP Handler ---
const MCP_TOOLS = [
    {
        name: "create_provider",
        description: "Create a new loyalty program provider",
        inputSchema: {
            type: "object",
            properties: {
                company_name: { type: "string", description: "Company name" },
                program_name: { type: "string", description: "Program name" },
                program_url: { type: "string", description: "Program URL" },
                sector: { type: "string", description: "Sector (airline, hotel, retail, etc.)" },
                region: { type: "string", description: "Region" },
                estimated_members: { type: "integer", description: "Estimated member count" },
                key_characteristics: { type: "string", description: "Key characteristics" },
            },
            required: ["company_name", "program_name", "sector"],
        },
    },
    {
        name: "create_normalized",
        description: "Create a normalized loyalty program record",
        inputSchema: {
            type: "object",
            properties: {
                company_name: { type: "string" },
                program_name: { type: "string" },
                sector: { type: "string" },
                region: { type: "string" },
                estimated_members: { type: "integer" },
                tier_count: { type: "integer" },
                tier_names: { type: "string" },
                miles_expiry: { type: "string" },
                award_pricing: { type: "string" },
                earn_rate: { type: "string" },
                credit_card_partners: { type: "string" },
                alliance: { type: "string" },
                points_currency: { type: "string" },
                best_redemption: { type: "string" },
            },
            required: ["company_name"],
        },
    },
    {
        name: "bulk_providers",
        description: "Create multiple providers in bulk",
        inputSchema: {
            type: "object",
            properties: {
                providers: { type: "array", description: "Array of provider objects" },
            },
            required: ["providers"],
        },
    },
];

async function handleMcpSse(request, env, url) {
    const auth = await requireApiKey(request, url, env);
    if (!auth.valid) return json({ error: auth.error }, 401);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    await writer.write(encoder.encode(`event: endpoint\ndata: /mcp/message\n\n`));

    const keepalive = setInterval(async () => {
        await writer.write(encoder.encode(`: keepalive\n\n`));
    }, 30000);

    request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        writer.close();
    });

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}

async function handleMcpMessage(request, env, url) {
    const auth = await requireApiKey(request, url, env);
    if (!auth.valid) return json({ error: auth.error }, 401);

    const body = await request.json();
    const { method, id, params } = body;

    if (method === "initialize") {
        return Response.json({
            jsonrpc: "2.0", id,
            result: {
                protocolVersion: "2024-11-05",
                serverInfo: { name: "loyalty-engine-mcp", version: "1.0.0" },
                capabilities: { tools: {} },
            },
        }, { headers: corsHeaders });
    }

    if (method === "tools/list") {
        return Response.json({
            jsonrpc: "2.0", id,
            result: { tools: MCP_TOOLS },
        }, { headers: corsHeaders });
    }

    if (method === "tools/call") {
        const { name, arguments: args } = params;
        let result;

        if (name === "create_provider") {
            const fakeRequest = { json: () => Promise.resolve(args), headers: new Headers() };
            const resp = await handleCreateProvider(fakeRequest, env);
            result = { content: [{ type: "text", text: await resp.text() }] };
        } else if (name === "create_normalized") {
            const fakeRequest = { json: () => Promise.resolve(args), headers: new Headers() };
            const resp = await handleCreateNormalized(fakeRequest, env);
            result = { content: [{ type: "text", text: await resp.text() }] };
        } else if (name === "bulk_providers") {
            const fakeRequest = { json: () => Promise.resolve(args), headers: new Headers() };
            const resp = await handleBulkProviders(fakeRequest, env);
            result = { content: [{ type: "text", text: await resp.text() }] };
        } else {
            return Response.json({
                jsonrpc: "2.0", id,
                error: { code: -32601, message: "Unknown tool" },
            }, { headers: corsHeaders });
        }

        return Response.json({ jsonrpc: "2.0", id, result }, { headers: corsHeaders });
    }

    return Response.json({
        jsonrpc: "2.0", id,
        error: { code: -32601, message: "Method not found" },
    }, { headers: corsHeaders });
}

// --- Router ---
export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const path = url.pathname;

        // MCP endpoints (require API key)
        if (path === "/mcp/sse" || path === "/v1/mcp/sse") {
            return handleMcpSse(request, env, url);
        }
        if (path === "/mcp/message" || path === "/v1/mcp/message") {
            return handleMcpMessage(request, env, url);
        }

        // Write endpoints (require API key)
        if (path === "/api/providers" && request.method === "POST") {
            const auth = await requireApiKey(request, url, env);
            if (!auth.valid) return json({ error: auth.error }, 401);
            return handleCreateProvider(request, env);
        }
        if (path === "/api/normalized" && request.method === "POST") {
            const auth = await requireApiKey(request, url, env);
            if (!auth.valid) return json({ error: auth.error }, 401);
            return handleCreateNormalized(request, env);
        }
        if (path === "/api/providers/bulk" && request.method === "POST") {
            const auth = await requireApiKey(request, url, env);
            if (!auth.valid) return json({ error: auth.error }, 401);
            return handleBulkProviders(request, env);
        }

        // Read endpoints (public)
        try {
            if (path === "/api/stats") return await handleStats(env);
            if (path === "/api/providers") return await handleProviders(env, url);
            if (path === "/api/parameters") return await handleParameters(env, url);
            if (path === "/api/crawled") return await handleCrawled(env);
            if (path === "/api/normalized") return await handleNormalized(env, url);
        } catch (err) {
            return json({ error: err.message }, 500);
        }

        // Static assets
        return env.ASSETS.fetch(request);
    },
};
