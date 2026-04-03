export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  async function tryFetch(ticker) {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? Math.round(price) : null;
  }

  try {
    // KOSPI 시도 → KOSDAQ 시도
    let price = await tryFetch(`${symbol}.KS`);
    if (!price) price = await tryFetch(`${symbol}.KQ`);

    if (!price) {
      return new Response(JSON.stringify({ error: 'parse failed', symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ symbol, price }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=60' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
