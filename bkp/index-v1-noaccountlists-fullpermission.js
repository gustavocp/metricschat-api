require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const { GoogleAdsApi } = require('google-ads-api');

// 🔹 Inicializa o Firebase Admin
const serviceAccount = require('./metricschat-firebase-adminsdk-njs58-f58d3bb9ee.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();

// 🔹 Configuração do OAuth2 para Google Ads
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

console.log("CLIENT_ID:", process.env.CLIENT_ID);
console.log("CLIENT_SECRET:", process.env.CLIENT_SECRET);
console.log("REDIRECT_URI:", process.env.REDIRECT_URI);

// 🔹 Escopo necessário para acessar campanhas do Google Ads
const scopes = ['https://www.googleapis.com/auth/adwords'];

/**
 * 🔹 Endpoint para exibir uma página de login com botão de autenticação no Google Ads.
 */
app.get('/login', async (req, res) => {
  // 🔹 Pegando um usuário real do Firestore (substitua pelo seu método)

  const userId = req.query.userId;
  
  if (!userId) {
    return res.send('<h3>Erro: Parâmetro <code>userId</code> é obrigatório.</h3>');
  }
  // 🔹 HTML com o botão que redireciona para autenticação do Google Ads
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
        h1 { font-size: 22px; margin-bottom: 20px; }
        .btn { padding: 10px 20px; font-size: 18px; background: #4285F4; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn:hover { background: #357ae8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Autentique sua Conta Google Ads</h1>
        <a class="btn" href="http://localhost:3000/auth/google-ads?userId=${userId}">Login com Google Ads</a>
      </div>
    </body>
    </html>
  `;

  res.send(html);
});

/**
 * 🔹 Endpoint para iniciar a autenticação no Google Ads.
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
      scope: ['https://www.googleapis.com/auth/adwords'],
      state: state,
      redirect_uri: process.env.REDIRECT_URI, // Forçando o parâmetro,
      client_id:process.env.CLIENT_ID
    });
  
    console.log('Redirecionando para URL:', url); // Debug
    res.redirect(url);
  });
  
  

/**
 * 🔹 Callback após autenticação do Google Ads.
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

    res.json({ message: 'Google Ads autenticado com sucesso!', tokens });
  } catch (error) {
    console.error('Erro ao recuperar tokens:', error);
    res.status(500).send('Erro na autenticação com o Google Ads.');
  }
});

/**
 * 🔹 Endpoint para verificar o status da conexão do usuário.
 */
app.get('/status', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Parâmetro userId é obrigatório.' });
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().googleAds) {
      return res.json({ status: 'não conectado' });
    }

    return res.json({ status: 'conectado', tokens: userDoc.data().googleAds.tokens });
  } catch (err) {
    console.error('Erro ao consultar status:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Inicializa o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
