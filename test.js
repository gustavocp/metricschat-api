// testeFirestore.js
const admin = require('firebase-admin');
const serviceAccount = require('./metricschat-firebase-adminsdk-njs58-f58d3bb9ee.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

(async function runTest() {
  try {
    await db.collection('test').add({ hello: 'world' });
    console.log('Escreveu com sucesso! 🎉');
  } catch (err) {
    console.error('Erro ao escrever no Firestore:', err);
  }
})();
