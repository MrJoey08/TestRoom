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

async function vindPdf(map) {
  const { body } = await haalOp(`/${map}/`);
  const html = body.toString('utf8');
  const m = html.match(/href="([^"]*\.pdf)"/i) || html.match(/([\w%.\-]+\.pdf)/i);
  return m ? decodeURIComponent(m[1].split('/').pop()) : null;
}

async function vindPptx() {
  const { body } = await haalOp('/');
  const html = body.toString('utf8');
  // Haal het volledige pad op, bijv. "info/Week 11.pptx"
  const m = html.match(/href="([^"?#]*\.pptx)"/i);
  return m ? decodeURIComponent(m[1]) : 'info/infobord.pptx';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { map, bestand } = req.query;

  try {
    // ── PDF: ?map=vandaag of ?map=morgen ────────────────────────────
    if (map && ['vandaag', 'morgen'].includes(map)) {
      const naam = await vindPdf(map);
      if (!naam) return res.status(404).json({ error: `Geen PDF in /${map}/` });

      const upstream = await haalOp(`/${map}/${encodeURIComponent(naam)}`);
      if (upstream.status === 404) return res.status(404).json({ error: 'PDF niet gevonden' });

      // ETag gebaseerd op bestandsnaam + last-modified zodat browser
      // wijzigingen detecteert zonder de inhoud opnieuw te downloaden
      const lastMod = upstream.headers['last-modified'] || '';
      const etag    = `"${naam}-${lastMod}"`;

      // Controleer If-None-Match — stuur 304 als niets veranderd
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache'); // altijd revalideren
      if (upstream.headers['content-length'])
        res.setHeader('Content-Length', upstream.headers['content-length']);
      return res.status(200).end(upstream.body);
    }

    // ── PPTX: ?bestand=infobord ──────────────────────────────────────
    if (bestand === 'infobord') {
      const pad  = await vindPptx();               // bijv. "info/Week 11.pptx"
      const naam = pad.split('/').pop();            // bijv. "Week 11.pptx"
      const upstream = await haalOp('/' + encodeURI(pad));
      if (upstream.status === 404) return res.status(404).json({ error: 'Infobord niet gevonden' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', 'attachment; filename="' + naam + '"');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).end(upstream.body);
    }

    return res.status(400).json({ error: 'Gebruik ?map=vandaag, ?map=morgen, of ?bestand=infobord' });

  } catch (err) {
    console.error('Proxy fout:', err.message);
    return res.status(502).json({ error: 'Originele server niet bereikbaar', detail: err.message });
  }
};
