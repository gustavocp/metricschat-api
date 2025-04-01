require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

// ---------------------------------------------------------------------
// 1) Inicialização do Firebase Admin
//    - Verifique se esse JSON está no mesmo local, com nome correto
//    - Certifique-se de que a conta de serviço tem permissão no Firestore
// ---------------------------------------------------------------------
const serviceAccount = {
  type: process.env.GOOGLE_TYPE,
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: process.env.GOOGLE_AUTH_URI,
  token_uri: process.env.GOOGLE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
};
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Se quiser usar Real Time Database, adicione databaseURL
  // databaseURL: 'https://SEU-PROJETO.firebaseio.com'
});

const db = admin.firestore();

// ---------------------------------------------------------------------
// 2) Configurações Express, Body Parser e Swagger
// ---------------------------------------------------------------------
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API Facebook Ads Integration',
    version: '1.0.0',
    description: 'Documentação da API para integração com Facebook Ads utilizando Express, Firebase e Facebook Graph API v22.0',
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Servidor de desenvolvimento',
    },
  ],
};

const swaggerOptions = {
  swaggerDefinition,
  apis: ['./facebook.js'], // Ajuste para o arquivo onde estão suas rotas
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------------------------------------------------------------------
// 3) Rota GET /login
// ---------------------------------------------------------------------
/**
 * @swagger
 * /login:
 *   get:
 *     summary: Página de login com botão de autenticação do Facebook Ads.
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
  console.log(`🔹 [GET /login] userId=${userId}`);

  if (!userId) {
    return res.send('<h3>Erro: Parâmetro <code>userId</code> é obrigatório.</h3>');
  }

  // Verifica se FB_REDIRECT_URI está definido
  const redirectUri = process.env.FB_REDIRECT_URI;
  if (!redirectUri) {
    console.error('FB_REDIRECT_URI não está definido no .env');
    return res.status(500).send('Erro de configuração: FB_REDIRECT_URI não está definido.');
  }

  // Remove a parte "/auth/facebook-ads/callback" para obter a URL base
  const baseUrl = redirectUri.replace(/\/auth\/facebook-ads\/callback$/, '');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login Facebook Ads</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .container { max-width: 400px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 2px 2px 10px rgba(0,0,0,0.1); }
        .btn { padding: 10px 20px; font-size: 18px; background: #1877F2; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
        .btn:hover { background: #0f5bb5; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Autentique sua Conta Facebook Ads</h1>
        <a class="btn" href="${baseUrl}/auth/facebook-ads?userId=${userId}">Login com Facebook Ads</a>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// ---------------------------------------------------------------------
// 4) Rota GET /auth/facebook-ads (inicia fluxo OAuth do Facebook Ads)
// ---------------------------------------------------------------------
/**
 * @swagger
 * /auth/facebook-ads:
 *   get:
 *     summary: Inicia a autenticação com o Facebook Ads.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       302:
 *         description: Redireciona para a URL de autorização do Facebook.
 *       400:
 *         description: Parâmetro userId ausente.
 */
app.get('/auth/facebook-ads', (req, res) => {
  const userId = req.query.userId;
  console.log(`🔹 [GET /auth/facebook-ads] userId=${userId}`);

  if (!userId) {
    return res.status(400).json({ error: 'Parâmetro userId é obrigatório.' });
  }

  // Define os escopos necessários para acesso aos dados de Ads
  const scope = 'ads_management,ads_read';
  const authURL =
    `https://www.facebook.com/v22.0/dialog/oauth?client_id=${process.env.FB_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.FB_REDIRECT_URI)}` +
    `&scope=${scope}` +
    `&response_type=code` +
    `&state=${userId}`;

  console.log(`🔹 [GET /auth/facebook-ads] Redirecionando para: ${authURL}`);
  res.redirect(authURL);
});

// ---------------------------------------------------------------------
// 5) Rota GET /auth/facebook-ads/callback (Facebook redireciona pra cá)
// ---------------------------------------------------------------------
/**
 * @swagger
 * /auth/facebook-ads/callback:
 *   get:
 *     summary: Callback após autenticação com o Facebook Ads.
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Código de autorização fornecido pelo Facebook.
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário passado inicialmente.
 *     responses:
 *       302:
 *         description: Redireciona para a seleção de conta.
 *       400:
 *         description: Parâmetros ausentes ou inválidos.
 *       500:
 *         description: Erro interno na autenticação.
 */
app.get('/auth/facebook-ads/callback', async (req, res) => {
  const { code, state } = req.query;
  console.log(`🔹 [GET /auth/facebook-ads/callback] code=${code}, state=${state}`);

  if (!code) {
    return res.status(400).send('Código de autenticação não fornecido.');
  }
  const userId = state; // Usando o state para recuperar o userId

  try {
    // Troca o code pelo access_token
    const tokenResponse = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        client_id: process.env.FB_CLIENT_ID,
        client_secret: process.env.FB_CLIENT_SECRET,
        redirect_uri: process.env.FB_REDIRECT_URI,
        code,
      },
    });
    const tokens = tokenResponse.data; // Inclui access_token, token_type, expires_in
    console.log(`🔹 [Callback] Obtido access_token para userId=${userId}`);

    // (Opcional) Obter informações do usuário Facebook
    const userInfoResponse = await axios.get('https://graph.facebook.com/v22.0/me', {
      params: { access_token: tokens.access_token },
    });
    const fbUser = userInfoResponse.data;
    console.log(
      `🔹 [Callback] Usuário Facebook: ${fbUser.name} (ID: ${fbUser.id})`
    );

    // ---------------------------------------------------------------------
    // Tentativa de salvar tokens no Firestore
    // Se der erro "16 UNAUTHENTICATED", é problema de credencial do Firebase.
    // ---------------------------------------------------------------------
    await db.collection('users').doc(userId).set(
      {
        facebookAds: {
          connected: true,
          tokens: tokens,
          fbUserId: fbUser.id,
          fbUserName: fbUser.name,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    console.log(`✅ [Callback] Token salvo no Firestore para userId=${userId}`);

    // Redireciona para a página de seleção de conta
    res.redirect(`/facebook-ads/select-account?userId=${userId}`);
  } catch (error) {
    console.error(
      `❌ [Callback] Erro ao obter token:`,
      error.response?.data || error.message
    );
    res.status(500).send('Erro na autenticação com o Facebook Ads.');
  }
});

// ---------------------------------------------------------------------
// 6) Rota GET /facebook-ads/select-account
//    Exibe a página para o usuário escolher qual conta de anúncio usar
// ---------------------------------------------------------------------
/**
 * @swagger
 * /facebook-ads/select-account:
 *   get:
 *     summary: Exibe a página para seleção da conta Facebook Ads.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do usuário.
 *     responses:
 *       200:
 *         description: Página HTML com a lista de contas Facebook Ads.
 *       400:
 *         description: Erro na autenticação ou parâmetro ausente.
 *       500:
 *         description: Erro interno.
 */
app.get('/facebook-ads/select-account', async (req, res) => {
  const userId = req.query.userId;
  console.log(`🔹 [GET /facebook-ads/select-account] userId=${userId}`);

  if (!userId) {
    return res.status(400).send('Parâmetro userId é obrigatório.');
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (
      !userDoc.exists ||
      !userDoc.data().facebookAds ||
      !userDoc.data().facebookAds.tokens
    ) {
      return res
        .status(400)
        .send('Usuário não autenticado no Facebook Ads.');
    }

    const accessToken = userDoc.data().facebookAds.tokens.access_token;

    // Obtém as contas de anúncio do usuário
    const adAccountsResponse = await axios.get(
      'https://graph.facebook.com/v22.0/me/adaccounts',
      {
        params: { access_token: accessToken },
      }
    );
    const adAccounts = adAccountsResponse.data.data || [];

    if (adAccounts.length === 0) {
      return res.send(
        '<h3>Nenhuma conta de anúncio encontrada para este usuário.</h3>'
      );
    }

    // Monta as opções do dropdown com IDs e nomes
    const optionsHtml = adAccounts
      .map((acc) => {
        const accountId = acc.id;
        const accountName = acc.name || accountId;
        return `<option value="${accountId}">${accountName}</option>`;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Selecionar Conta Facebook Ads</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
          .container { max-width: 400px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; box-shadow: 2px 2px 10px rgba(0,0,0,0.1); }
          .btn { padding: 10px 20px; font-size: 18px; background: #1877F2; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
          .btn:hover { background: #0f5bb5; }
          select { padding: 10px; font-size: 16px; margin-bottom: 20px; width: 100%; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Selecione sua Conta Facebook Ads</h1>
          <form action="/facebook-ads/select-account" method="POST">
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
    console.error(
      `❌ [GET /facebook-ads/select-account] Erro:`,
      error.response?.data || error.message
    );
    res.status(500).send('Erro interno ao obter contas de anúncio.');
  }
});

// ---------------------------------------------------------------------
// 7) Rota POST /facebook-ads/select-account
//    Salva a conta selecionada no Firestore
// ---------------------------------------------------------------------
/**
 * @swagger
 * /facebook-ads/select-account:
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
app.post('/facebook-ads/select-account', async (req, res) => {
  const { userId, selectedAccount } = req.body;
  console.log(
    `🔹 [POST /facebook-ads/select-account] userId=${userId}, selectedAccount=${selectedAccount}`
  );

  if (!userId || !selectedAccount) {
    return res
      .status(400)
      .json({ error: 'userId e selectedAccount são obrigatórios.' });
  }

  try {
    await db
      .collection('users')
      .doc(userId)
      .update({
        'facebookAds.selectedAccount': { id: selectedAccount },
      });

    console.log(
      `✅ [POST /facebook-ads/select-account] Conta ${selectedAccount} salva para userId=${userId}`
    );
    res.json({ message: 'Conta salva com sucesso!', selectedAccount });
  } catch (error) {
    console.error(`❌ [POST /facebook-ads/select-account] Erro:`, error);
    res
      .status(500)
      .json({ error: 'Erro ao salvar a conta selecionada.' });
  }
});

// ---------------------------------------------------------------------
// 8) Rota GET /facebook-ads/campaigns
//    Busca campanhas da conta selecionada
// ---------------------------------------------------------------------
/**
 * @swagger
 * /facebook-ads/campaigns:
 *   get:
 *     summary: Consulta campanhas da conta selecionada do Facebook Ads.
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
app.get('/facebook-ads/campaigns', async (req, res) => {
  const userId = req.query.userId;
  console.log(`🔹 [GET /facebook-ads/campaigns] userId=${userId}`);

  if (!userId) {
    return res.status(400).json({ error: 'userId é obrigatório.' });
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (
      !userDoc.exists ||
      !userDoc.data().facebookAds ||
      !userDoc.data().facebookAds.tokens ||
      !userDoc.data().facebookAds.selectedAccount
    ) {
      return res.status(400).json({
        error: 'Usuário não autenticado no Facebook Ads ou conta não selecionada.',
      });
    }

    const accessToken = userDoc.data().facebookAds.tokens.access_token;
    const accountId = userDoc.data().facebookAds.selectedAccount.id;

    console.log(
      `🔹 [GET /facebook-ads/campaigns] Buscando campanhas para a conta ${accountId}...`
    );

    // Consulta campanhas da conta
    const campaignsResponse = await axios.get(
      `https://graph.facebook.com/v22.0/${accountId}/campaigns`,
      {
        params: {
          access_token: accessToken,
          fields: 'id,name',
        },
      }
    );
    const campaigns = campaignsResponse.data.data || [];

    console.log(
      `✅ [GET /facebook-ads/campaigns] Total de campanhas encontradas: ${campaigns.length}`
    );
    res.json({ campaigns });
  } catch (error) {
    console.error(
      `❌ [GET /facebook-ads/campaigns] Erro:`,
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ error: 'Erro interno ao buscar campanhas do Facebook Ads.' });
  }
});



app.get('/facebook-ads/campaignFiltered', async (req, res) => {
  const userId = req.query.userId;
  console.log(`🔹 [GET /facebook-ads/campaignFiltered] userId=${userId}`);

  if (!userId) {
    return res.status(400).json({ error: 'userId é obrigatório.' });
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();

    if (
      !userDoc.exists ||
      !userDoc.data().facebookAds ||
      !userDoc.data().facebookAds.tokens ||
      !userDoc.data().facebookAds.selectedAccount
    ) {
      return res.status(400).json({
        error: 'Usuário não autenticado no Facebook Ads ou conta não selecionada.',
      });
    }

    const accessToken = userDoc.data().facebookAds.tokens.access_token;
    const accountId = userDoc.data().facebookAds.selectedAccount.id;

    console.log(`🔹 Buscando campanhas ativas da conta ${accountId}...`);

    const response = await axios.get(`https://graph.facebook.com/v22.0/${accountId}/campaigns`, {
      params: {
        access_token: accessToken,
        fields: [
          'id',
          'name',
          'status',
          'objective',
          'insights{impressions,clicks,conversions,cost_per_conversion}'
        ].join(','),
        effective_status: ['ACTIVE'], // apenas campanhas ativas
      },
    });

    const campaigns = response.data.data || [];
    console.log(`✅ ${campaigns.length} campanhas ativas encontradas.`);

    res.json({ campaigns });
  } catch (error) {
    console.error('❌ Erro ao buscar campanhas filtradas:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao buscar campanhas ativas com métricas.' });
  }
});


// ---------------------------------------------------------------------
// 9) Rota GET /facebook-ads/status
//    Verifica se o token ainda está válido, se a integração está OK
// ---------------------------------------------------------------------
/**
 * @swagger
 * /facebook-ads/status:
 *   get:
 *     summary: Verifica o status da conexão com o Facebook Ads.
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
app.get('/facebook-ads/status', async (req, res) => {
  const userId = req.query.userId;
  console.log(`🔹 [GET /facebook-ads/status] userId=${userId}`);

  if (!userId) {
    return res
      .status(400)
      .json({ status: false, message: 'userId é obrigatório.' });
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().facebookAds) {
      return res
        .status(400)
        .json({ status: false, message: 'Usuário não autenticado no Facebook Ads.' });
    }

    const accessToken = userDoc.data().facebookAds.tokens.access_token;

    const adAccountsResponse = await axios.get(
      'https://graph.facebook.com/v22.0/me/adaccounts',
      {
        params: { access_token: accessToken },
      }
    );

    const accounts = adAccountsResponse.data.data || [];
    res.json({
      status: true,
      message: 'Conexão com Facebook Ads está OK!',
      accessibleAccounts: accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
      })),
    });
  } catch (error) {
    console.error(
      `❌ [GET /facebook-ads/status] Erro:`,
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ status: false, message: 'Erro interno ao verificar conexão.' });
  }
});

// ---------------------------------------------------------------------
// 10) Inicializa o servidor
// ---------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor Facebook Ads rodando em http://localhost:${PORT}`);
  console.log(`📚 Acesse /api-docs para visualizar a documentação Swagger.`);
});
