const https = require('https');

const ORIGIN = 'rw.altenacollege.nl';

// Haal bytes op van de originele server (SSL-check uitgeschakeld)
function haalOp(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: ORIGIN,
        path,
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
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Vind een .pdf bestandsnaam via directory listing van /vandaag/ of /morgen/
async function vindPdf(map) {
  const { body } = await haalOp(`/${map}/`);
  const html = body.toString('utf8');
  // nginx/apache directory listing: <a href="bestand.pdf">
  const m = html.match(/href="([^"?#]*\.pdf)"/i) || html.match(/([\w%.\-]+\.pdf)/i);
  return m ? decodeURIComponent(m[1].split('/').pop()) : null;
}

// Vind het infobord pptx-bestand op de hoofdpagina
async function vindPptx() {
  const { body } = await haalOp('/');
  const html = body.toString('utf8');
  const m = html.match(/href="([^"?#]*\.pptx)"/i) || html.match(/([\w%.\-]+\.pptx)/i);
  return m ? decodeURIComponent(m[1].split('/').pop()) : 'infobord.pptx';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { map, bestand } = req.query;

  try {
    // ── PDF: /api/proxy?map=vandaag  of  ?map=morgen ────────────────
    if (map && ['vandaag', 'morgen'].includes(map)) {
      const naam = await vindPdf(map);
      if (!naam) return res.status(404).json({ error: `Geen PDF in /${map}/` });

      const upstream = await haalOp(`/${map}/${encodeURIComponent(naam)}`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      if (upstream.headers['content-length'])
        res.setHeader('Content-Length', upstream.headers['content-length']);
      return res.status(200).end(upstream.body);
    }

    // ── PPTX: /api/proxy?bestand=infobord ───────────────────────────
    if (bestand === 'infobord') {
      const naam = await vindPptx();
      const upstream = await haalOp(`/${naam}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', 'attachment; filename="infobord.pptx"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).end(upstream.body);
    }

    return res.status(400).json({ error: 'Gebruik ?map=vandaag, ?map=morgen, of ?bestand=infobord' });

  } catch (err) {
    console.error('Proxy fout:', err.message);
    return res.status(502).json({ error: 'Originele server niet bereikbaar', detail: err.message });
  }
};
