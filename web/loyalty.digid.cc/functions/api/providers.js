// Pages Function: /api/providers
export async function onRequest(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
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
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
}
