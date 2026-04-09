const http = require('http');
const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { kpn } = event.queryStringParameters || {};
  if (!kpn) return { statusCode: 400, headers, body: JSON.stringify({ error: '개체번호 필요' }) };

  const apiKey = process.env.AGRIX_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API 키 미설정' }) };

  const BASE = `http://data.ekape.or.kr/openapi-data/service/user/animalTrace/traceNoSearch?ServiceKey=${encodeURIComponent(apiKey)}&traceNo=${encodeURIComponent(kpn)}`;

  try {
    // 기본정보(1), 예방접종(4), 브루셀라(6), 사육현황(2)
    const [raw1, raw2, raw4, raw6] = await Promise.all([
      fetch2(BASE + '&optionNo=1'),
      fetch2(BASE + '&optionNo=2'),
      fetch2(BASE + '&optionNo=4'),
      fetch2(BASE + '&optionNo=6'),
    ]);

    // 디버그: 각 응답 앞부분 로그
    console.log('=== optionNo=1 ===', raw1.substring(0, 500));
    console.log('=== optionNo=2 ===', raw2.substring(0, 500));
    console.log('=== optionNo=4 ===', raw4.substring(0, 500));
    console.log('=== optionNo=6 ===', raw6.substring(0, 500));

    const result = {
      // 개체 기본정보
      birthYmd:     getVal(raw1, 'birthYmd'),
      sexNm:        getVal(raw1, 'sexNm'),
      lsTypeNm:     getVal(raw1, 'lsTypeNm'),
      nationNm:     getVal(raw1, 'nationNm'),
      // 사육현황
      farmNo:       getVal(raw2, 'farmNo'),
      farmNm:       getVal(raw2, 'farmNm'),
      // 예방접종
      vaccinations: parseItems(raw4, ['injcDt','injcSeNm','injcOrgnNm']),
      // 브루셀라
      brucella:     parseItems(raw6, ['exmYmd','rsltNm','exmOrgnNm']),
      // 원본 (디버그용)
      _raw1: raw1.substring(0, 300),
      _raw4: raw4.substring(0, 300),
      _raw6: raw6.substring(0, 300),
    };

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch(e) {
    console.error('Agrix 오류:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

function fetch2(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function getVal(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

function parseItems(xml, tags) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const obj = {};
    tags.forEach(t => { obj[t] = getVal(block, t); });
    items.push(obj);
  }
  return items;
}
