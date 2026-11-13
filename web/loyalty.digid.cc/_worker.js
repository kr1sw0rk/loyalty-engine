// Loyalty Program Intelligence — Pages Advanced Worker
// Routes API requests to handlers, serves static assets via env.ASSETS

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

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

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const path = url.pathname;

        try {
            if (path === "/api/stats") return await handleStats(env);
            if (path === "/api/providers") return await handleProviders(env, url);
            if (path === "/api/parameters") return await handleParameters(env, url);
            if (path === "/api/crawled") return await handleCrawled(env);
        } catch (err) {
            return json({ error: err.message }, 500);
        }

        // Static assets
        return env.ASSETS.fetch(request);
    },
};
