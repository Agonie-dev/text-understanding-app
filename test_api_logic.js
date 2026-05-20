const mammoth = require('mammoth');

// 测试 mammoth
async function testMammoth() {
  try {
    const buffer = Buffer.from('PK');
    const result = await mammoth.extractRawText({ buffer });
    console.log('mammoth OK:', result.value?.substring(0, 50));
  } catch (e) {
    console.log('mammoth error:', e.message);
  }
}

// 测试 pdf-parse 动态导入（绕过 index.js debug）
async function testPdfParse() {
  try {
    const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    console.log('pdfParse type:', typeof pdfParse);
    const result = await pdfParse(Buffer.from('test'));
    console.log('pdfParse result text length:', result.text?.length);
  } catch (e) {
    console.log('pdfParse error:', e.message);
  }
}

// 测试 supabase
async function testSupabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const client = createClient(url, key);
    const { data, error } = await client.from('history').select('*').limit(1);
    console.log('supabase:', error ? 'error: ' + error.message : 'OK, rows:', data?.length);
  } catch (e) {
    console.log('supabase error:', e.message);
  }
}

(async () => {
  await testMammoth();
  await testPdfParse();
  await testSupabase();
})();
