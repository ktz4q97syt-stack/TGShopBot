const orderRepo = require('../../database/repositories/orderRepo');
const userRepo = require('../../database/repositories/userRepo');
const feedbackRepo = require('../../database/repositories/feedbackRepo');
const texts = require('../../utils/texts');
const formatters = require('../../utils/formatters');
const notificationService = require('../../services/notificationService');
const config = require('../../config');

module.exports = (bot) => {

    // ─── 1. MEINE BESTELLUNGEN (ÜBERSICHT) ───────────────────────────────────
    bot.action('my_orders', async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const userId = ctx.from.id;
            const orders = await orderRepo.getActiveOrdersByUser(userId);

            if (!orders || orders.length === 0) {
                const emptyText = texts.getMyOrdersEmpty();
                const kb = { inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'back_to_main' }]] };
                return await ctx.editMessageText(emptyText, { parse_mode: 'Markdown', reply_markup: kb }).catch(async () => {
                    await ctx.reply(emptyText, { parse_mode: 'Markdown', reply_markup: kb });
                });
            }

            let text = texts.getMyOrdersHeader() + '\n\n';
            const keyboard = [];

            orders.forEach((order, i) => {
                const date = new Date(order.created_at).toLocaleDateString('de-DE');
                const statusLabel = texts.getCustomerStatusLabel(order.status);

                text += `${i + 1}. \`#${order.order_id}\`\n`;
                text += `💰 ${formatters.formatPrice(order.total_amount)} | ${statusLabel}\n`;
                if (order.digital_delivery) {
                    text += `🔐 _Digitale Lieferung verfügbar_\n`;
                }
                text += `📅 ${date}\n\n`;

                if (order.status === 'offen' && !order.tx_id) {
                    keyboard.push([{ text: `💸 Zahlen: ${order.order_id}`, callback_data: `confirm_pay_${order.order_id}` }]);
                }

                keyboard.push([{ text: `📋 Bestellung #${order.order_id}`, callback_data: `cust_order_detail_${order.order_id}` }]);
            });

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('My Orders Error:', error.message);
        }
    });

    // ─── 2. EINZEL-BESTELLÜBERSICHT FÜR KUNDEN ───────────────────────────────
    bot.action(/^cust_order_detail_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const order = await orderRepo.getOrderByOrderId(orderId);

            if (!order || order.user_id !== userId) {
                return ctx.answerCbQuery('⚠️ Bestellung nicht gefunden.', { show_alert: true });
            }

            const date = new Date(order.created_at).toLocaleDateString('de-DE');
            const statusLabel = texts.getCustomerStatusLabel(order.status);

            let text = `📋 *Bestellung #${order.order_id}*\n\n`;
            text += `📅 Datum: ${date}\n`;
            text += `💰 Betrag: ${formatters.formatPrice(order.total_amount)}\n`;
            text += `💳 Zahlung: ${order.payment_method_name || 'N/A'}\n`;
            text += `📦 Status: ${statusLabel}\n`;

            if (order.delivery_method === 'shipping') text += `🚚 Lieferung: Versand\n`;
            else if (order.delivery_method === 'pickup') text += `🏪 Lieferung: Abholung\n`;
            else text += `📱 Lieferung: Digital\n`;

            if (order.tx_id) text += `🔑 TX-ID: \`${order.tx_id}\`\n`;

            if (order.details && order.details.length > 0) {
                text += `\n*Artikel:*`;
                order.details.forEach(item => {
                    const path = item.category_path ? `_${item.category_path}_ » ` : '';
                    text += `\n▪️ ${item.quantity}x ${path}${item.name} = ${formatters.formatPrice(item.total)}`;
                });
            }

            const keyboard = [];

            if (order.digital_delivery) {
                keyboard.push([{ text: '🔐 Deliverables Tresor', callback_data: `cust_tresor_${orderId}` }]);
                keyboard.push([{ text: '🔄 Replace anfragen', callback_data: `cust_replace_${orderId}` }]);
            }

            if (order.status === 'abgeschlossen') {
                keyboard.push([{ text: '🗑 Bestellung löschen', callback_data: `cust_del_order_${orderId}` }]);
            }

            keyboard.push([
                { text: '🔔 Ping senden', callback_data: `cust_ping_${orderId}` },
                { text: '💬 Kontakt', callback_data: `cust_contact_${orderId}` }
            ]);

            keyboard.push([{ text: '🔙 Zurück', callback_data: 'my_orders' }]);

            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }).catch(async () => {
                await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
            });
        } catch (error) {
            console.error('Customer Order Detail Error:', error.message);
        }
    });

    // ─── 3. DELIVERABLES TRESOR ──────────────────────────────────────────────
    bot.action(/^cust_tresor_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const order = await orderRepo.getOrderByOrderId(orderId);

            if (!order || order.user_id !== userId) {
                return ctx.answerCbQuery('⚠️ Bestellung nicht gefunden.', { show_alert: true });
            }

            if (!order.digital_delivery) {
                return ctx.answerCbQuery('Noch keine digitalen Artikel geliefert.', { show_alert: true });
            }

            const msgText = texts.getDigitalDeliveryCustomerMessage(orderId, order.digital_delivery);
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🔙 Zur Bestellung', callback_data: `cust_order_detail_${orderId}` }]
                ]
            };

            // Permanente Nachricht – kein Lösch-Button, bleibt im Chat
            await ctx.reply(msgText, { parse_mode: 'Markdown', reply_markup: keyboard });

        } catch (error) {
            console.error('Tresor Error:', error.message);
            ctx.answerCbQuery('Fehler beim Laden.', { show_alert: true }).catch(() => {});
        }
    });

    // ─── 4. REPLACE ANFRAGEN ─────────────────────────────────────────────────
    bot.action(/^cust_replace_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const order = await orderRepo.getOrderByOrderId(orderId);

            if (!order || order.user_id !== userId) {
                return ctx.answerCbQuery('⚠️ Bestellung nicht gefunden.', { show_alert: true });
            }

            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `ID: ${userId}`);

            notificationService.notifyAdminReplaceRequest({
                orderId,
                userId,
                username
            }).catch(() => {});

            await ctx.reply(texts.getReplaceRequestSent(orderId), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📋 Zur Bestellung', callback_data: `cust_order_detail_${orderId}` }]]
                }
            });
        } catch (error) {
            console.error('Replace Request Error:', error.message);
        }
    });

    // ─── 5. DIGITALE LIEFERUNG LEGACY (view_dig_del_) ────────────────────────
    bot.action(/^view_dig_del_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            const order = await orderRepo.getOrderByOrderId(orderId);
            if (!order || !order.digital_delivery) return ctx.answerCbQuery('⚠️ Keine Keys gefunden.', { show_alert: true });

            const keyboard = {
                inline_keyboard: [[{ text: '🔙 Zur Bestellung', callback_data: `cust_order_detail_${orderId}` }]]
            };
            const msgText = texts.getDigitalDeliveryCustomerMessage(orderId, order.digital_delivery);
            await ctx.reply(msgText, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            ctx.answerCbQuery('Fehler beim Laden.', { show_alert: true }).catch(() => {});
        }
    });

    // ─── 6. BESTELLUNG LÖSCHEN ───────────────────────────────────────────────
    bot.action(/^cust_del_order_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            await orderRepo.updateOrderStatus(orderId, 'loeschung_angefragt');
            const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Kunde');

            if (notificationService.notifyAdminOrderDeleteRequest) {
                notificationService.notifyAdminOrderDeleteRequest({ orderId, userId: ctx.from.id, username }).catch(() => {});
            }

            ctx.answerCbQuery('🗑 Löschung angefragt.').catch(() => {});
            ctx.update.callback_query.data = 'my_orders';
            return bot.handleUpdate(ctx.update);
        } catch (error) {
            console.error('Customer Delete Order Error:', error.message);
        }
    });

    // ─── 7. ZAHLUNGS-LOGIK (TX-ID) ───────────────────────────────────────────
    bot.action(/^confirm_pay_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const orderId = ctx.match[1];
            if (!ctx.session) ctx.session = {};
            ctx.session.awaitingTxId = orderId;
            await ctx.reply(texts.getTxIdPrompt(), {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: 'cancel_txid' }]] }
            });
        } catch (error) { console.error('Confirm Pay Error:', error.message); }
    });

    bot.action('cancel_txid', async (ctx) => {
        ctx.answerCbQuery('Abgebrochen').catch(() => {});
        if (ctx.session) ctx.session.awaitingTxId = null;
        await ctx.reply('❌ TX-ID Eingabe abgebrochen.', {
            reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
        });
    });

    // ─── 8. SUPPORT (PING & KONTAKT) ─────────────────────────────────────────
    bot.action(/^cust_ping_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const userId = ctx.from.id;
            const canPing = await userRepo.canPing(userId);
            if (!canPing) return ctx.answerCbQuery(texts.getPingCooldown().replace('⏰ ', ''), { show_alert: true });

            await userRepo.setPingTimestamp(userId);
            notificationService.notifyAdminsPing({ userId, username: ctx.from.username || 'Kunde', orderId }).catch(() => {});
            ctx.answerCbQuery('✅ Ping gesendet!').catch(() => {});
        } catch (error) { console.error('Ping Error:', error.message); }
    });

    bot.action(/^cust_contact_(.+)$/, async (ctx) => {
        try {
            const orderId = ctx.match[1];
            const canContact = await userRepo.canContact(ctx.from.id);
            if (!canContact) return ctx.answerCbQuery(texts.getContactCooldown().replace('⏰ ', ''), { show_alert: true });
            ctx.answerCbQuery().catch(() => {});
            await ctx.scene.enter('contactScene', { orderId });
        } catch (error) { console.error('Contact Error:', error.message); }
    });

    // ─── 9. FEEDBACK-SYSTEM (MIT PAGINIERUNG) ────────────────────────────────
    bot.action(/^view_feedbacks(?:_(\d+))?$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try {
            const page = ctx.match && ctx.match[1] ? parseInt(ctx.match[1]) : 1;
            const limit = 10;
            const offset = (page - 1) * limit;

            const stats = await feedbackRepo.getFeedbackStats();
            const { data: feedbacks, count: totalFeedbacks } = await feedbackRepo.getApprovedFeedbacks(limit, offset);

            let text = '';
            const inline_keyboard = [];

            if (!feedbacks || feedbacks.length === 0) {
                text = texts.getPublicFeedbacksEmpty();
            } else {
                text = texts.getPublicFeedbacksHeader(stats.average, stats.total);
                feedbacks.forEach(fb => {
                    text += `${'⭐'.repeat(fb.rating)} - *${fb.username}*\n${fb.comment ? `_"${fb.comment}"_` : ''}\n\n`;
                });

                const totalPages = Math.ceil(totalFeedbacks / limit);
                if (totalPages > 1) {
                    const navRow = [];
                    if (page > 1) navRow.push({ text: '⬅️', callback_data: `view_feedbacks_${page - 1}` });
                    navRow.push({ text: `Seite ${page} / ${totalPages}`, callback_data: 'ignore_click' });
                    if (page < totalPages) navRow.push({ text: '➡️', callback_data: `view_feedbacks_${page + 1}` });
                    inline_keyboard.push(navRow);
                }
            }

            inline_keyboard.push([{ text: '🔙 Zurück', callback_data: 'back_to_main' }]);
            await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } }).catch(() => {
                ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });
            });
        } catch (error) { console.error('View Feedbacks Error:', error.message); }
    });

    bot.action('ignore_click', (ctx) => ctx.answerCbQuery().catch(() => {}));

    bot.action(/^start_feedback_(.+)$/, async (ctx) => {
        ctx.answerCbQuery().catch(() => {});
        try { await ctx.scene.enter('feedbackScene', { orderId: ctx.match[1] }); } catch (error) {}
    });

    // ─── 10. MESSAGE HANDLER (TX-ID SAMMLER) ─────────────────────────────────
    bot.on('message', async (ctx, next) => {
        if (!ctx.session || !ctx.message || !ctx.message.text) return next();
        const input = ctx.message.text.trim();
        if (input.startsWith('/')) {
            ctx.session.awaitingTxId = null;
            return next();
        }

        if (ctx.session.awaitingTxId) {
            const orderId = ctx.session.awaitingTxId;
            ctx.session.awaitingTxId = null;
            try {
                const updated = await orderRepo.updateOrderTxId(orderId, input);
                if (!updated) return ctx.reply(`⚠️ Bestellung ${orderId} nicht gefunden.`);
                await ctx.reply(texts.getTxIdConfirmed(orderId), {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '📋 Meine Bestellungen', callback_data: 'my_orders' }]] }
                });
                notificationService.notifyAdminsTxId({ orderId, userId: ctx.from.id, username: ctx.from.username || 'Kunde', txId: input }).catch(() => {});
            } catch (error) {
                ctx.reply('❌ Fehler beim Speichern.');
            }
            return;
        }
        return next();
    });
};
