const texts = require('./texts');

const updateOrSend = async (ctx, text, replyMarkup, imageUrl = null) => {
    const options = {
        parse_mode: 'Markdown',
        ...(replyMarkup && { reply_markup: replyMarkup })
    };

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const isCurrentlyPhoto = ctx.callbackQuery.message.photo !== undefined;

            if (imageUrl) {
                if (isCurrentlyPhoto) {
                    return await ctx.editMessageMedia({
                        type: 'photo', media: imageUrl, caption: text, parse_mode: 'Markdown'
                    }, { reply_markup: replyMarkup });
                } else {
                    await ctx.deleteMessage().catch(() => {});
                    return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
                }
            } else {
                if (isCurrentlyPhoto) {
                    await ctx.deleteMessage().catch(() => {});
                    return await ctx.reply(text, options);
                } else {
                    return await ctx.editMessageText(text, options);
                }
            }
        } else {
            if (imageUrl) {
                return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
            } else {
                return await ctx.reply(text, options);
            }
        }
    } catch (error) {
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.deleteMessage().catch(() => {});
            }
            if (imageUrl) {
                return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
            }
            return await ctx.reply(text, options);
        } catch (fallbackError) {
            console.error('UI Helper Error:', fallbackError.message);
        }
    }
};

const sendTemporary = async (ctx, text, seconds = 3) => {
    try {
        if (ctx.message) ctx.deleteMessage().catch(() => {});
        const msg = await ctx.reply(`✨ ${text}`);
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
        }, seconds * 1000);
    } catch (error) {
        console.error('Temp Message Error:', error.message);
    }
};

const sendProductMedia = async (ctx, imageUrl, text, replyMarkup) => {
    const options = { parse_mode: 'Markdown', reply_markup: replyMarkup };
    const hasMedia = ctx.callbackQuery?.message?.photo || ctx.callbackQuery?.message?.animation || ctx.callbackQuery?.message?.video;

    if (imageUrl) {
        if (ctx.callbackQuery?.message) await ctx.deleteMessage().catch(() => {});
        try {
            return await ctx.replyWithPhoto(imageUrl, { caption: text, ...options });
        } catch (e1) {
            try {
                return await ctx.replyWithAnimation(imageUrl, { caption: text, ...options });
            } catch (e2) {
                try {
                    return await ctx.replyWithVideo(imageUrl, { caption: text, ...options });
                } catch (e3) {
                    return await ctx.reply(text + texts.getAdminImageLoadError(), options);
                }
            }
        }
    } else {
        if (hasMedia) {
            if (ctx.callbackQuery?.message) await ctx.deleteMessage().catch(() => {});
            return await ctx.reply(text, options);
        } else {
            return await updateOrSend(ctx, text, replyMarkup);
        }
    }
};

module.exports = { updateOrSend, sendTemporary, sendProductMedia };
