export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = `https://finance.naver.com/item/main.naver?code=${symbol}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9' }
    });
    const html = await res.text();

    // 현재가 파싱
    const match = html.match(/<p class="no_today">[\s\S]*?<span class="blind">현재가<\/span>[\s\S]*?<span[^>]*>([\d,]+)<\/span>/);
    const price = match ? parseInt(match[1].replace(/,/g, '')) : null;

    // 종목명 파싱
    const nameMatch = html.match(/<title>([^(]+)\(/);
    const name = nameMatch ? nameMatch[1].trim() : symbol;

    if (!price) {
      return new Response(JSON.stringify({ error: 'parse failed', symbol }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ symbol, name, price }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=30'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
