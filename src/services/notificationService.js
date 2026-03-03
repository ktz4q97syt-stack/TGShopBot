const config = require('../config');
const userRepo = require('../database/repositories/userRepo');
const orderRepo = require('../database/repositories/orderRepo'); 
const texts = require('../utils/texts');

let botInstance = null;

const init = (bot) => {
    botInstance = bot;
};

const sendTo = async (chatId, text, options = {}) => {
    if (!botInstance) throw new Error('NotificationService not initialized');
    try {
        return await botInstance.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
    } catch (e) {
        return null;
    }
};

const editAdminMessage = async (chatId, messageId, text, options = {}) => {
    if (!botInstance) return null;
    try {
        return await botInstance.telegram.editMessageText(chatId, messageId, null, text, { parse_mode: 'Markdown', ...options });
    } catch (e) {
        return null;
    }
};

const sendOrderReceipt = async (userId, data) => {
    const text = texts.getOrderReceipt(data);
    return sendTo(userId, text);
};

const notifyCustomerStatusUpdate = async (userId, orderId, newStatus) => {
    const text = texts.getStatusUpdateText(orderId, newStatus);
    return sendTo(userId, text);
};

const notifyAdminsInterest = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminInterestNotify(data);
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        
        for (const id of targetIds) {
            sendTo(id, text);
        }
    } catch (error) {
        console.error('Notify Interest Error:', error.message);
    }
};

const notifyAdminsNewOrder = async (data) => {
    try {
        const admins = await userRepo.getAllAdmins();
        const text = texts.getAdminNewOrderNotify({
            ...data,
            total: data.total || '0.00',
            paymentName: data.paymentName || (data.paymentId === 'MANUAL' ? 'Manuelle Abwicklung' : data.paymentId)
        });

        const keyboard = {
            inline_keyboard: [[{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }]]
        };

        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));

        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard, disable_web_page_preview: true })
                .then(msg => {
                    if (msg && msg.message_id) orderRepo.addNotificationMsgId(data.orderId, id, msg.message_id);
                }).catch(() => {});
        }
    } catch (error) {
        console.error('Notify New Order Error:', error.message);
    }
};
const notifyAdminsTxId = async (data) => {
    try {
        const order = await orderRepo.getOrderByOrderId(data.orderId);
        const safeData = {
            orderId: data.orderId,
            userId: data.userId || (order ? order.user_id : 'Unbekannt'),
            username: (data.username && data.username !== 'undefined') ? data.username : 'Kunde',
            total: (data.total && data.total !== 'undefined' && data.total !== 'NaN €') ? data.total : (order ? (parseFloat(order.total_amount).toFixed(2).replace('.', ',') + ' €') : '0,00 €'),
            paymentName: (data.paymentName && data.paymentName !== 'undefined') ? data.paymentName : (order ? order.payment_method_name : 'Unbekannt'),
            txId: data.txId
        };

        const text = texts.getAdminTxIdNotify(safeData);
        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 Bestellung öffnen', callback_data: `oview_${safeData.orderId}` }],
                [{ text: '✅ Zahlung bestätigen', callback_data: `ostatus_${safeData.orderId}_in_bearbeitung` }]
            ]
        };

        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));

        if (order && order.notification_msg_ids && order.notification_msg_ids.length > 0) {
            for (const notif of order.notification_msg_ids) {
                editAdminMessage(notif.chat_id, notif.message_id, text, { reply_markup: keyboard })
                    .then(res => {
                        if (!res) sendTo(notif.chat_id, text, { reply_markup: keyboard });
                    }).catch(() => sendTo(notif.chat_id, text, { reply_markup: keyboard }));
            }
        } else {
            for (const id of targetIds) {
                sendTo(id, text, { reply_markup: keyboard })
                    .then(msg => {
                        if (msg && msg.message_id) orderRepo.addNotificationMsgId(safeData.orderId, id, msg.message_id);
                    }).catch(() => {});
            }
        }
    } catch (error) {
        console.error('Notify TxId Error:', error.message);
    }
};

const notifyAdminsPing = async (data) => {
    try {
        const text = texts.getAdminPingNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}` }],
            [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }]
        ]};
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error(error.message); }
};

const notifyAdminsContact = async (data) => {
    try {
        const text = texts.getAdminContactNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '👤 Kontaktieren', url: `tg://user?id=${data.userId}` }],
            [{ text: '📋 Bestellung öffnen', callback_data: `oview_${data.orderId}` }]
        ]};
        const admins = await userRepo.getAllAdmins();
        const targetIds = new Set(admins.map(a => String(a.telegram_id)));
        targetIds.add(String(config.MASTER_ADMIN_ID));
        for (const id of targetIds) {
            sendTo(id, text, { reply_markup: keyboard });
        }
    } catch (error) { console.error(error.message); }
};

const notifyMasterBan = async (data) => {
    try {
        const text = texts.getMasterBanNotify(data);
        const keyboard = { inline_keyboard: [
            [{ text: '↩️ Ban aufheben', callback_data: `master_revert_ban_${data.banId}` }],
            [{ text: '✅ Sofort bestätigen', callback_data: `master_confirm_ban_${data.banId}` }]
        ]};
        sendTo(config.MASTER_ADMIN_ID, text, { reply_markup: keyboard });
    } catch (error) { console.error(error.message); }
};

const sendBroadcast = async (text, adminId) => {
    try {
        const customers = await userRepo.getAllCustomers();
        if (!customers || customers.length === 0) return sendTo(adminId, '⚠️ Keine Kunden gefunden.');
        let successCount = 0;
        for (const customer of customers) {
            const res = await sendTo(customer.telegram_id, text);
            if (res) successCount++;
        }
        await sendTo(adminId, `📢 Broadcast beendet. Erreicht: ${successCount}/${customers.length}`);
    } catch (error) { console.error(error.message); }
};

module.exports = {
    init, sendTo, editAdminMessage, sendOrderReceipt, notifyCustomerStatusUpdate,
    notifyAdminsInterest, notifyAdminsNewOrder, notifyAdminsTxId, 
    notifyAdminsPing, notifyAdminsContact, notifyMasterBan, sendBroadcast
};
