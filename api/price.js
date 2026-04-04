export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const type = searchParams.get('type'); // 'index' or default 'stock'

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
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      price: Math.round(meta.regularMarketPrice * 100) / 100,
      prev: Math.round(meta.chartPreviousClose * 100) / 100,
    };
  }

  try {
    let result = null;

    if (type === 'index') {
      // 지수는 심볼 그대로 사용 (^KS11, ^KQ11, ^GSPC)
      result = await tryFetch(symbol);
    } else {
      // 종목은 KS → KQ 순으로 시도
      result = await tryFetch(`${symbol}.KS`);
      if (!result) result = await tryFetch(`${symbol}.KQ`);
    }

    if (!result) {
      return new Response(JSON.stringify({ error: 'not found', symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    const change = result.prev ? ((result.price - result.prev) / result.prev * 100) : null;

    return new Response(JSON.stringify({
      symbol,
      price: result.price,
      prev: result.prev,
      change: change ? Math.round(change * 100) / 100 : null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=60' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
