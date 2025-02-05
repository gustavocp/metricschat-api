require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

// 🔹 Inicializa Firebase Admin
const serviceAccount = require('./metricschat-firebase-adminsdk-njs58-f58d3bb9ee.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🔹 Configuração do OAuth2 para Google Ads
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);
const scopes = ['https://www.googleapis.com/auth/adwords'];

// 🔹 Configuração do Swagger
const PORT = process.env.PORT || 3000;
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API Google Ads Integration',
    version: '1.0.0',
    description: 'Documentação da API para integração com Google Ads utilizando Express, Firebase e Google Ads API.'
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Servidor de desenvolvimento'
    }
  ]
};

const swaggerOptions = {
  swaggerDefinition,
  // Ajuste o caminho se este arquivo tiver outro nome ou estiver em outro diretório
  apis: ['./index.js']
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /login:
 *   get:
 *     summary: Página de login com botão de autenticação.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       200:
 *         description: Página HTML com o botão de autenticação.
 *       400:
 *         description: Parâmetro userId ausente.
 */
app.get('/login', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.send('<h3>Erro: Parâmetro <code>userId</code> é obrigatório.</h3>');
  }
  
  // Obtém o REDIRECT_URI definido no .env
  const redirectUri = process.env.REDIRECT_URI; // Ex: https://apigads.ekz.com.br/auth/google-ads/callback
  
  // Remove a parte "/auth/google-ads/callback" para obter a URL base
  const baseUrl = redirectUri.replace(/\/auth\/google-ads\/callback$/, '');
  
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login Google Ads</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .container { max-width: 400px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.1); }
        .btn { padding: 10px 20px; font-size: 18px; background: #4285F4; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn:hover { background: #357ae8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Autentique sua Conta Google Ads</h1>
        <a class="btn" href="${baseUrl}/auth/google-ads?userId=${userId}">Login com Google Ads</a>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});



/**
 * @swagger
 * /auth/google-ads:
 *   get:
 *     summary: Inicia autenticação no Google Ads.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       302:
 *         description: Redireciona para a URL de autenticação do Google.
 *       400:
 *         description: Parâmetro userId ausente.
 */
app.get('/auth/google-ads', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Parâmetro userId é obrigatório.' });
  }
  const state = JSON.stringify({ userId });
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: state
  });
  res.redirect(url);
});

/**
 * @swagger
 * /auth/google-ads/callback:
 *   get:
 *     summary: Callback após autenticação.
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Código de autenticação fornecido pelo Google.
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Parâmetro state que contém o userId.
 *     responses:
 *       302:
 *         description: Redireciona para seleção de conta.
 *       400:
 *         description: Parâmetros ausentes ou inválidos.
 *       500:
 *         description: Erro interno na autenticação.
 */
app.get('/auth/google-ads/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Código de autenticação não fornecido.');
  }

  let userId = null;
  if (req.query.state) {
    try {
      const state = JSON.parse(req.query.state);
      userId = state.userId;
    } catch (err) {
      console.error('Erro ao parsear o state:', err);
    }
  }
  if (!userId) {
    return res.status(400).send('Parâmetro userId não encontrado.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    await db.collection('users').doc(userId).set({
      googleAds: {
        connected: true,
        tokens: tokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    res.redirect(`/google-ads/select-account?userId=${userId}`);
  } catch (error) {
    console.error('Erro ao recuperar tokens:', error);
    res.status(500).send('Erro na autenticação com o Google Ads.');
  }
});

/**
 * @swagger
 * /google-ads/select-account:
 *   get:
 *     summary: Exibe a página para seleção da conta Google Ads.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       200:
 *         description: Página HTML com a lista de contas.
 *       400:
 *         description: Erro na autenticação ou parâmetro ausente.
 *       500:
 *         description: Erro interno.
 */
app.get('/google-ads/select-account', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).send("UserId é obrigatório.");
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().googleAds) {
      return res.status(400).send("Usuário não autenticado no Google Ads.");
    }

    const { tokens } = userDoc.data().googleAds;
    const accessToken = tokens.access_token;

    // 🔹 1️⃣ Obtém os IDs das contas acessíveis
    const response = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.DEVELOPER_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.error) {
      console.error("Erro ao obter contas:", data.error);
      return res.status(400).send("Erro ao obter contas: " + JSON.stringify(data.error));
    }

    const customerIds = data.resourceNames.map(resource => resource.split('/')[1]);

    if (customerIds.length === 0) {
      return res.send("<h3>Nenhuma conta disponível.</h3>");
    }

    // 🔹 2️⃣ Monta o HTML apenas com os IDs
    const optionsHtml = customerIds.map(customerId =>
      `<option value="${customerId}">${customerId}</option>`
    ).join("");

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Selecionar Conta Google Ads</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
              .container { max-width: 400px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.1); }
              .btn { padding: 10px 20px; font-size: 18px; background: #4285F4; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
              .btn:hover { background: #357ae8; }
              select { padding: 10px; font-size: 16px; margin-bottom: 20px; width: 100%; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>Selecione sua Conta Google Ads</h1>
              <form action="/google-ads/select-account" method="POST">
                  <input type="hidden" name="userId" value="${userId}" />
                  <select name="selectedAccount" required>
                      ${optionsHtml}
                  </select>
                  <br>
                  <button type="submit" class="btn">Salvar Conta</button>
              </form>
          </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Erro ao selecionar conta:", error);
    res.status(500).send("Erro interno");
  }
});

/**
 * @swagger
 * /google-ads/select-account:
 *   post:
 *     summary: Salva a conta selecionada no Firestore.
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               selectedAccount:
 *                 type: string
 *     responses:
 *       200:
 *         description: Conta salva com sucesso.
 *       400:
 *         description: Parâmetros ausentes ou inválidos.
 *       500:
 *         description: Erro interno ao salvar a conta.
 */
app.post('/google-ads/select-account', async (req, res) => {
  const { userId, selectedAccount } = req.body;

  if (!userId || !selectedAccount) {
    return res.status(400).json({ error: "UserId e selectedAccount são obrigatórios." });
  }

  try {
    await db.collection('users').doc(userId).update({
      'googleAds.selectedAccount': {
        id: selectedAccount
      }
    });

    res.json({ message: "Conta salva com sucesso!", selectedAccount });
  } catch (err) {
    console.error("Erro ao salvar conta selecionada:", err);
    res.status(500).json({ error: "Erro ao salvar a conta selecionada." });
  }
});

/**
 * @swagger
 * /google-ads/campaigns:
 *   get:
 *     summary: Consulta campanhas da conta Google Ads.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       200:
 *         description: Lista de campanhas.
 *       400:
 *         description: Parâmetros ausentes ou erro na consulta.
 *       500:
 *         description: Erro interno ao buscar campanhas.
 */
app.get('/google-ads/campaigns', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "UserId é obrigatório." });
  }

  try {
    // 🔹 1️⃣ Pega os tokens e a conta selecionada do Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().googleAds || !userDoc.data().googleAds.selectedAccount) {
      return res.status(400).json({ error: "Usuário não autenticado no Google Ads ou conta não selecionada." });
    }

    const { tokens, selectedAccount } = userDoc.data().googleAds;
    const accessToken = tokens.access_token;
    const accountId = selectedAccount.id;

    // 🔹 2️⃣ Verifica se a conta é MCC (Manager)
    console.log(`🔹 Buscando detalhes da conta ${accountId}...`);

    const accountResponse = await fetch(`https://googleads.googleapis.com/v17/customers/${accountId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.DEVELOPER_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const accountText = await accountResponse.text();
    let accountData;

    try {
      accountData = JSON.parse(accountText);
    } catch (error) {
      console.error("❌ Erro ao converter JSON (Conta):", accountText);
      return res.status(500).json({ error: "Erro ao processar resposta da conta. Verifique permissões." });
    }

    if (accountData.error) {
      console.error("❌ Erro ao buscar detalhes da conta:", accountData.error);
      return res.status(400).json({ error: "Erro ao buscar detalhes da conta. Possível problema de permissão." });
    }

    if (accountData.manager === true) {
      return res.status(400).json({ 
        error: "Esta é uma conta MCC (Manager). Selecione uma conta simples para visualizar campanhas."
      });
    }

    // 🔹 3️⃣ Consulta das campanhas da conta simples
    console.log(`🔹 Buscando campanhas da conta ${accountId}...`);
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros
      FROM campaign
      WHERE segments.date DURING TODAY
    `;

    const campaignResponse = await fetch(`https://googleads.googleapis.com/v17/customers/${accountId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.DEVELOPER_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    const campaignText = await campaignResponse.text();
    let campaignData;

    try {
      campaignData = JSON.parse(campaignText);
    } catch (error) {
      console.error("❌ Erro ao converter JSON (Campanhas):", campaignText);
      return res.status(500).json({ error: "Erro ao processar resposta das campanhas." });
    }

    if (campaignData.error) {
      console.error("❌ Erro ao obter campanhas:", campaignData.error);
      return res.status(400).json({ error: "Erro ao obter campanhas: " + JSON.stringify(campaignData.error) });
    }

    res.json({ campaigns: campaignData.results });

  } catch (error) {
    console.error("❌ Erro ao buscar campanhas:", error);
    res.status(500).json({ error: "Erro interno ao buscar campanhas." });
  }
});

/**
 * @swagger
 * /google-ads/status:
 *   get:
 *     summary: Verifica o status da conexão com o Google Ads.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       200:
 *         description: Status da conexão e contas acessíveis.
 *       400:
 *         description: Parâmetro ausente ou erro na verificação.
 *       500:
 *         description: Erro interno ao verificar conexão.
 */
app.get('/google-ads/status', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ status: false, message: "UserId é obrigatório." });
  }

  try {
    // 🔹 1️⃣ Pega os tokens do Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().googleAds) {
      return res.status(400).json({ status: false, message: "Usuário não autenticado no Google Ads." });
    }

    let { tokens } = userDoc.data().googleAds;
    let accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    console.log(`🔹 Verificando conexão do usuário ${userId}...`);

    // 🔹 2️⃣ Requisição para listar as contas disponíveis
    let response = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.DEVELOPER_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    let responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (error) {
      console.error("❌ Erro ao converter JSON (Status):", responseText);
      return res.status(500).json({
        status: false,
        message: "Erro ao processar resposta da API. Verifique permissões.",
        rawResponse: responseText
      });
    }

    // 🔹 3️⃣ Se o erro for 401, tenta renovar o token
    if (responseData.error && responseData.error.code === 401 && refreshToken) {
      console.warn("⚠️ Token expirado. Tentando renovar...");
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.CLIENT_ID,
          process.env.CLIENT_SECRET,
          process.env.REDIRECT_URI
        );

        const { tokens: newTokens } = await oauth2Client.refreshToken(refreshToken);
        await db.collection('users').doc(userId).update({
          'googleAds.tokens': newTokens
        });

        accessToken = newTokens.access_token;
        console.log("✅ Token renovado!");

        response = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': process.env.DEVELOPER_TOKEN,
            'Content-Type': 'application/json'
          }
        });

        responseText = await response.text();
        responseData = JSON.parse(responseText);
      } catch (refreshError) {
        console.error("❌ Erro ao renovar token:", refreshError);
        return res.status(401).json({
          status: false,
          message: "Erro ao renovar token. Faça login novamente.",
          errorDetails: refreshError
        });
      }
    }

    if (responseData.error) {
      console.error("❌ Erro ao verificar status:", responseData.error);
      return res.status(400).json({
        status: false,
        message: "Erro ao verificar conexão",
        errorDetails: responseData.error
      });
    }

    const accounts = responseData.resourceNames || [];
    return res.json({
      status: true,
      message: "Conexão com Google Ads está OK!",
      accessibleAccounts: accounts.map(acc => acc.split('/')[1])
    });

  } catch (error) {
    console.error("❌ Erro ao verificar conexão:", error);
    res.status(500).json({ status: false, message: "Erro interno ao verificar conexão." });
  }
});

// 🔹 Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
