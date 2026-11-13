// Pages Function: /api/parameters
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
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
}
