// Pages Function: /api/stats
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
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
}
