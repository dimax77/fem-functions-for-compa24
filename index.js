/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers
 *  at https://firebase.google.com/docs/functions
 */

// const {onRequest} = require("firebase-functions/v2/https");
// const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Инициализация SDK Firebase
admin.initializeApp();

// Функция, которая срабатывает при добавлении нового события в коллекцию 'events'
exports.sendNewEventNotification = functions.firestore
  .document("events/{eventId}")
  .onCreate(async (snap, context) => {
    try {
      const newEvent = snap.data(); // Данные нового события

      // Check if the event is private
      if (newEvent.isPrivate) {
        console.log("The event is private. Notification will not be sent.");
        return; // Exit the function if the event is private
      }

      // Настроим уведомление
      const payload = {
        notification: {
          title: "Новое событие!",
          body: `Событие: ${newEvent.title}`, // Или другое поле события
        },
        data: {
          eventId: context.params.eventId, // Можно передать данные события
          type: "event"
        },
      };

      // Получите список токенов устройств
      const tokens = await getUserTokens(); // Реализовать эту функцию

      if (tokens.length > 0) {
        try {
          // Отправка уведомления на устройства с использованием sendMulticast
          const message = {
            tokens: tokens, // Список FCM токенов
            notification: payload.notification,
            data: payload.data,
          };

          const response = await admin.messaging().sendEachForMulticast(message);
          console.log(`${response.successCount} сообщений отправлено, ${response.failureCount} ошибок.`);

          if (response.failureCount > 0) {
            response.responses.forEach((resp, index) => {
              if (!resp.success) {
                console.error(`Ошибка при отправке сообщения на токен ${tokens[index]}: ${resp.error.message}`);
              }
            });
          }

          console.log("Уведомления отправлены");
        } catch (messagingError) {
          console.error("Ошибка при отправке уведомлений:", messagingError.message);
        }
      } else {
        console.log("Нет доступных токенов для отправки уведомлений");
      }
    } catch (error) {
      console.error("Ошибка при обработке нового события:", error.message);
    }
  });

/**
 * Получение списка FCM токенов пользователей
 * @return {Array} Массив токенов
 */
async function getUserTokens() {
  try {
    // Предположим, что у вас есть коллекция 'users' с токенами FCM
    const usersSnapshot = await admin.firestore().collection("users").get();
    const tokens = [];
    usersSnapshot.forEach((userDoc) => {
      const token = userDoc.data().fcmToken;
      if (token) tokens.push(token);
    });

    return tokens;
  } catch (error) {
    console.error("Ошибка при получении FCM токенов:", error.message);
    return [];
  }
}

exports.sendNewMessageNotification = functions.firestore
  .document('conversations/{dialogId}/messagesList/{messageId}')
  .onCreate(async (snap, context) => {
    const newMessage = snap.data();
    const senderId = newMessage.senderId;
    const receiverId = newMessage.receiverId;

    // Получаем токен получателя
    const receiverDoc = await admin.firestore().collection('users').doc(receiverId).get();
    const receiverData = receiverDoc.data();
    const fcmToken = receiverData.fcmToken;

    if (!fcmToken) {
      console.log('NewMessage. FCM Token not found for receiver:', receiverId);
      return;
    }

    const conversationId = `${context.params.dialogId}`;
    console.log('NewMessage. СonversationId:', conversationId);

    const messageId = `${context.params.messageId}`;
    // Подготавливаем уведомление
    const payload = {
      token: fcmToken,
      notification: {
        title: `${newMessage.senderName}`,
        body: `${newMessage.body}`
      },
      data: {
        conversationId: conversationId,
        messageId: messageId,
        type: "message",
        sender: `${newMessage.senderName}`,
        senderId: `${senderId}`
      }
    };

    // Отправляем уведомление на устройство получателя
    try {
      await admin.messaging().send(payload);
      console.log('NewMessage. Уведомление отправлено:', receiverId);
    } catch (error) {
      console.error('NewMessage. Ошибка при отправке уведомления:', error);
    }
  });

exports.sendMessageStatusUpdate = functions.firestore
  .document('conversations/{dialogId}/messagesList/{messageId}')
  .onUpdate(async (change, context) => {
    const beforeMessage = change.before.data();
    const afterMessage = change.after.data();

    // Проверяем, изменился ли статус сообщения
    if (beforeMessage.status !== afterMessage.status) {
      const senderId = afterMessage.senderId;
      const receiverId = afterMessage.receiverId;

      // Получаем токен получателя
      const senderDoc = await admin.firestore().collection('users').doc(senderId).get();
      const senderData = senderDoc.data();
      const fcmToken = senderData.fcmToken;

      if (!fcmToken) {
        console.log('MessageStatusUpdate. FCM Token not found for sender:', senderId);
        return;
      }

      const conversationId = `${context.params.dialogId}`;
      console.log('MessageStatusUpdate. СonversationId:', conversationId);

      const messageId = `${context.params.messageId}`;
      // Подготавливаем уведомление
      const payload = {
        token: fcmToken,
        data: {
          dialogId: conversationId,
          messageId: messageId,
          type: "messageStatus",
          sender: `${afterMessage.senderName}`,
          senderId: `${senderId}`,
          receiverId: `${receiverId}`,
          messageStatus: `${afterMessage.status}`,
          // Добавляем статус сообщения
          status: afterMessage.status
        }
      };

      // Отправляем уведомление на устройство получателя
      try {
        await admin.messaging().send(payload);
        console.log('MessageStatusUpdate. Уведомление отправлено:', receiverId);
      } catch (error) {
        console.error('MessageStatusUpdate. Ошибка при отправке уведомления:', error);
      }
    }
  });

