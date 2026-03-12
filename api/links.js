const https = require('https');

const ORIGIN = 'rw.altenacollege.nl';

function haalOp(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: ORIGIN,
        path: path,
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      },
      (res) => {
        const parts = [];
        res.on('data', (c) => parts.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store'); // altijd vers ophalen

  try {
    const { body } = await haalOp('/');
    const html = body.toString('utf8');

    // Haal de knoppen op: <a href="vandaag/....pdf" class="button primary">do 12 Mar</a>
    // en het infobord:    <a href="info/....pptx"  class="button primary2">Infobord</a>
    const btnRegex = /href="([^"]+\.(pdf|pptx))"[^>]*>([^<]+)</gi;
    const result = { vandaag: null, morgen: null, infobord: null };

    let m;
    while ((m = btnRegex.exec(html)) !== null) {
      const pad   = m[1];  // bijv. "vandaag/2026-12-03-do timestamp=....pdf"
      const label = m[3].trim(); // bijv. "do 12 Mar"

      if (pad.startsWith('vandaag/'))
        result.vandaag  = { map: 'vandaag', label };
      else if (pad.startsWith('morgen/'))
        result.morgen   = { map: 'morgen',  label };
      else if (pad.startsWith('info/'))
        result.infobord = { label };
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(result);

  } catch (err) {
    console.error('Links fout:', err.message);
    return res.status(502).json({ error: 'Originele server niet bereikbaar', detail: err.message });
  }
};
