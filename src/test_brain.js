const { getSystemPrompt } = require('./modules/brainLoader');

function runTest() {
  console.log("=== INICIANDO TESTE DO CÉREBRO DA TÂMARA BOT ===");

  try {
    console.log("\n1. Testando carregamento de prompt para o modo 'post'...");
    const postPrompt = getSystemPrompt('post');
    console.log(`Tamanho do prompt ('post'): ${postPrompt.length} caracteres.`);
    
    console.log("\n2. Testando carregamento de prompt para o modo 'reply'...");
    const replyPrompt = getSystemPrompt('reply');
    console.log(`Tamanho do prompt ('reply'): ${replyPrompt.length} caracteres.`);
    
    console.log("\n3. Testando carregamento de prompt para o modo 'mention'...");
    const mentionPrompt = getSystemPrompt('mention');
    console.log(`Tamanho do prompt ('mention'): ${mentionPrompt.length} caracteres.`);

    // Verifica se contem elementos do cérebro dinâmico carregado
    const isDynamic = postPrompt.includes("# Identidade de Tâmara Cavalcante") || 
                      postPrompt.includes("# Voz da Tâmara Bot");
    
    console.log(`\nStatus do carregamento: ${isDynamic ? '✅ CÉREBRO DINÂMICO (brain/) CARREGADO' : '⚠️ FALLBACK ATIVADO (Prompt Estático)'}`);

    // Mostrar uma prévia do prompt (primeiros 350 caracteres)
    console.log("\n--- PRÉVIA DO PROMPT (Primeiros 350 caracteres) ---");
    console.log(postPrompt.substring(0, 350) + "...\n");
    console.log("--- FIM DA PRÉVIA ---");

    console.log("\n--- CONTEXTO FINAL DO PROMPT ---");
    console.log("..." + postPrompt.substring(postPrompt.length - 180));
    console.log("---------------------------------\n");

    console.log("✅ TESTE CONCLUÍDO COM SUCESSO. Processamento executado corretamento.");

  } catch (err) {
    console.error("❌ OCORREU UM ERRO DURANTE O TESTE:", err);
  }
}

runTest();
