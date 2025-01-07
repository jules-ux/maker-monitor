const express = require('express');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

// Firebase-configuratie
const firebaseConfig = {
  // Je Firebase-config hier
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
app.use(express.json());

// API Endpoints
app.get('/api/prints', async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, 'prints'));
    const prints = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(prints);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching prints' });
  }
});

// Exporteer als serverless functie
module.exports = app;
