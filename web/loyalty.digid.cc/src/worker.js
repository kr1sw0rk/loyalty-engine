// Loyalty Program Intelligence — Cloudflare Worker API
// Serves data from D1 database

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // Route: /api/providers
        if (path === "/api/providers") {
            const sector = url.searchParams.get("sector");
            const region = url.searchParams.get("region");
            const search = url.searchParams.get("search");
            const limit = parseInt(url.searchParams.get("limit") || "200");

            let query = "SELECT * FROM providers WHERE 1=1";
            const params = [];

            if (sector) {
                query += " AND sector = ?";
                params.push(sector);
            }
            if (region) {
                query += " AND region = ?";
                params.push(region);
            }
            if (search) {
                query += " AND (company_name LIKE ? OR program_name LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }
            query += " ORDER BY estimated_members DESC LIMIT ?";
            params.push(limit);

            const { results } = await env.loyalty_engine.prepare(query).bind(...params).all();
            return Response.json(results, { headers: corsHeaders });
        }

        // Route: /api/parameters
        if (path === "/api/parameters") {
            const category = url.searchParams.get("category");
            const search = url.searchParams.get("search");

            let query = "SELECT * FROM parameters WHERE 1=1";
            const params = [];

            if (category) {
                query += " AND category = ?";
                params.push(category);
            }
            if (search) {
                query += " AND (name LIKE ? OR description LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }
            query += " ORDER BY category, name";

            const { results } = await env.loyalty_engine.prepare(query).bind(...params).all();
            return Response.json(results, { headers: corsHeaders });
        }

        // Route: /api/crawled
        if (path === "/api/crawled") {
            const { results } = await env.loyalty_engine.prepare(
                "SELECT * FROM crawled_data ORDER BY estimated_members DESC LIMIT 50"
            ).all();
            return Response.json(results, { headers: corsHeaders });
        }

        // Route: /api/stats
        if (path === "/api/stats") {
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

            return Response.json({
                providers: providers.count,
                parameters: parameters.count,
                sectors: sectors.results,
                crawled: crawled.count,
            }, { headers: corsHeaders });
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
};
