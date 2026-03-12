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
  // Links zelf worden nooit gecached — altijd vers ophalen zodat nieuwe
  // uploads op de originele site meteen zichtbaar zijn.
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { body } = await haalOp('/');
    const html = body.toString('utf8');

    const btnRegex = /href="([^"]+\.(pdf|pptx))"[^>]*>([^<]+)</gi;
    const result = { vandaag: null, morgen: null, infobord: null };

    let m;
    while ((m = btnRegex.exec(html)) !== null) {
      const pad   = m[1];
      const label = m[3].trim();

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
