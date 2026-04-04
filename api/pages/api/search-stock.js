import fs from 'fs/promises';
import path from 'path';

function normalize(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, '');
}

export default async function handler(req, res) {
  try {
    const q = String(req.query.q || '').trim();

    if (!q) {
      return res.status(200).json([]);
    }

    const filePath = path.join(process.cwd(), 'data', 'stocks.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const stocks = JSON.parse(raw);

    const nq = normalize(q);

    const results = stocks
      .map((item) => {
        const name = normalize(item.name);
        const code = String(item.code);

        let score = 0;

        if (name === nq || code === q) score = 100;
        else if (name.startsWith(nq)) score = 80;
        else if (name.includes(nq)) score = 60;
        else if (code.startsWith(q)) score = 50;
        else if (code.includes(q)) score = 40;

        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 10)
      .map(({ score, ...item }) => item);

    return res.status(200).json(results);
  } catch (err) {
    console.error('search-stock error:', err);
    return res.status(500).json({ error: 'stock search failed' });
  }
}
