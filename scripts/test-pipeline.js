const axios = require('axios');

const BASE_URL = 'http://localhost:3040';
const SECTOR = 'Technology';

async function testPipeline() {
  try {
    console.log(`Starting pipeline test for sector: ${SECTOR}...`);
    
    // 1. Trigger Job
    const startRes = await axios.post(`${BASE_URL}/api/pipeline/one-click`, {
      sector: SECTOR,
      top_n: 3
    });
    
    const { jobId } = startRes.data;
    console.log(`Job created with ID: ${jobId}`);
    
    // 2. Poll Status
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 30) {
      const statusRes = await axios.get(`${BASE_URL}/api/pipeline/one-click/status/${jobId}`);
      const job = statusRes.data;
      
      console.log(`[Job ${jobId}] Status: ${job.status}, Progress: ${job.progress}%`);
      
      if (job.status === 'COMPLETED') {
        console.log('Pipeline COMPLETED successfully!');
        console.log(`Result: ${job.result.filename}`);
        console.log(`PDF Size: ${Math.round(job.result.pdfBase64.length / 1024)} KB`);
        completed = true;
      } else if (job.status === 'FAILED') {
        console.error('Pipeline FAILED:', job.error);
        process.exit(1);
      }
      
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }
    
    if (!completed) {
      console.error('Pipeline timed out.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testPipeline();
