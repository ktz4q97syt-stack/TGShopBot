const supabase = require('../supabaseClient');
const crypto = require('crypto');

const generateCustomOrderId = () => {
    return 'order' + crypto.randomBytes(3).toString('hex');
};

const SELECT_FULL = `id, order_id, user_id, total_amount, status, details,
    shipping_link, payment_method_name,
    delivery_method, admin_notes, tx_id, created_at, notification_msg_ids, feedback_invited, digital_delivery`;

const createOrder = async (userId, totalAmount, orderDetails, options = {}) => {
    const { shippingLink, paymentMethodName, deliveryMethod } = options;
    const customId = generateCustomOrderId();

    const { data, error } = await supabase
        .from('orders')
        .insert([{
            user_id: userId,
            order_id: customId,
            total_amount: totalAmount,
            details: orderDetails, 
            status: 'offen',
            shipping_link: shippingLink || null,
            payment_method_name: paymentMethodName || 'Nicht angegeben',
            delivery_method: deliveryMethod || 'none',
            admin_notes: [],
            notification_msg_ids: [],
            feedback_invited: false,
            digital_delivery: null
        }])
        .select(SELECT_FULL);

    if (error) throw error;
    return data[0];
};

const getOrderByOrderId = async (orderId) => {
    if (!orderId) return null;
    const searchId = orderId.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('order_id', searchId)
        .maybeSingle();

    if (error) throw error;
    return data;
};

const getOrderById = async (id) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
};

const updateOrderStatus = async (orderId, newStatus) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('order_id', orderId)
        .select(SELECT_FULL);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
};

const updateOrderTxId = async (orderId, txId) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ tx_id: txId, status: 'bezahlt_pending' })
        .eq('order_id', orderId)
        .select(SELECT_FULL);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
};

const addAdminNote = async (orderId, authorName, noteText) => {
    const order = await getOrderByOrderId(orderId);
    if (!order) return null;
    const notes = order.admin_notes || [];
    notes.push({ author: authorName, text: noteText, date: new Date().toISOString() });
    const { data, error } = await supabase
        .from('orders')
        .update({ admin_notes: notes })
        .eq('order_id', orderId)
        .select(SELECT_FULL);
    if (error) throw error;
    return data[0];
};

const deleteOrder = async (orderId) => {
    const { error } = await supabase.from('orders').delete().eq('order_id', orderId);
    if (error) throw error;
    return true;
};

const deleteAllOrders = async () => {
    const { error } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return true;
};

const getOrdersByUser = async (userId) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return data || [];
};

const getActiveOrdersByUser = async (userId) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .eq('user_id', userId)
        .in('status', ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand', 'abgeschlossen'])
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

const hasActiveOrders = async (userId) => {
    const { data, error } = await supabase.from('orders').select('id').eq('user_id', userId).limit(1);
    if (error) throw error;
    return data && data.length > 0;
};

const getOpenOrders = async (limit = 20) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .in('status', ['offen', 'bezahlt_pending', 'in_bearbeitung', 'versand', 'loeschung_angefragt'])
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};

const getAllOrders = async (limit = 50) => {
    const { data, error } = await supabase
        .from('orders')
        .select(SELECT_FULL)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};

const addNotificationMsgId = async (orderId, chatId, messageId) => {
    try {
        const order = await getOrderByOrderId(orderId);
        if (!order) return null;
        const currentIds = order.notification_msg_ids || [];
        currentIds.push({ chat_id: chatId, message_id: messageId });
        const { error } = await supabase
            .from('orders')
            .update({ notification_msg_ids: currentIds })
            .eq('order_id', order.order_id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error adding notification msg id:', error.message);
        return false;
    }
};

const clearNotificationMsgIds = async (orderId) => {
    try {
        const order = await getOrderByOrderId(orderId);
        if (!order) return false;
        const { error } = await supabase
            .from('orders')
            .update({ notification_msg_ids: [] })
            .eq('order_id', order.order_id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error clearing notification msg ids:', error.message);
        return false;
    }
};

const setFeedbackInvited = async (orderId, isInvited) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ feedback_invited: isInvited })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error setting feedback invited:', error.message);
        return null;
    }
};

const setDigitalDelivery = async (orderId, content) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ digital_delivery: content })
            .eq('order_id', orderId)
            .select(SELECT_FULL);
        if (error) throw error;
        return data && data[0] ? data[0] : null;
    } catch (error) {
        console.error('Error saving digital delivery:', error.message);
        return null;
    }
};

module.exports = {
    createOrder, getOrderByOrderId, getOrderById,
    updateOrderStatus, updateOrderTxId, addAdminNote,
    deleteOrder, deleteAllOrders,
    getOrdersByUser, getActiveOrdersByUser, hasActiveOrders,
    getOpenOrders, getAllOrders,
    addNotificationMsgId, clearNotificationMsgIds,
    setFeedbackInvited, setDigitalDelivery
};
