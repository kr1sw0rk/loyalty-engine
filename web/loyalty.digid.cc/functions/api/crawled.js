// Pages Function: /api/crawled
export async function onRequest(context) {
    const { env } = context;
    
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (context.request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { results } = await env.loyalty_engine.prepare(
            "SELECT * FROM crawled_data ORDER BY estimated_members DESC LIMIT 50"
        ).all();
        return Response.json(results, { headers: corsHeaders });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
}
