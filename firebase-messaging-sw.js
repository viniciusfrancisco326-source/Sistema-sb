importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAB09oj91RuaytI8AIfFrXc1mYESnGPr9o",
  authDomain: "sistema-soubela.firebaseapp.com",
  projectId: "sistema-soubela",
  storageBucket: "sistema-soubela.firebasestorage.app",
  messagingSenderId: "625696420183",
  appId: "1:625696420183:web:7d264c60c9d2fd4cbcce12"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  self.registration.showNotification(
    payload.notification?.title || "Atualização do pedido",
    {
      body: payload.notification?.body || "Você recebeu uma atualização.",
      icon: "Sou bela -logo.png"
    }
  );
});
