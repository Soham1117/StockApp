const axios = require('axios');

const FASTAPI_URL = 'http://localhost:8000';
const INDUSTRY = 'Technology';
const SYMBOLS = ['AAPL', 'MSFT', 'NVDA'];

async function testFastAPI() {
  try {
    console.log(`Directly testing FastAPI industry analysis for ${INDUSTRY}...`);
    
    const payload = {
      symbols: SYMBOLS,
      weights: {
        pe: 1.0,
        ps: 1.0,
        pb: 1.0,
        ev_ebit: 1.0,
        ev_ebitda: 1.0
      }
    };

    const response = await axios.post(
      `${FASTAPI_URL}/api/industry/${encodeURIComponent(INDUSTRY)}/analysis`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('FastAPI response successful!');
    console.log('Symbols found:', response.data.symbols ? response.data.symbols.length : 0);
  } catch (error) {
    console.error('FastAPI test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data));
    }
  }
}

testFastAPI();
