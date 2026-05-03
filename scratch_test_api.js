import fetch from 'node-fetch'; // if available, or native fetch in node 18+

async function testApi() {
  const payload = {
    article_id: 'ht_prophecy_01',
    location: { country: 'Mexico', city: 'Monterrey' },
    device_type: 'desktop',
    referrer: 'direct'
  };

  try {
    const res = await fetch('http://localhost:3000/api/metrics/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
testApi();
