/*
 * © 2026 t.me/autoacts. Alle Rechte vorbehalten.
 * PROPRIETARY LICENSE. Weiterverkauf, Weitergabe und Vervielfältigung sind strengstens untersagt.
 * Siehe LICENSE Datei für Details.
 */
const { Telegraf, Scenes, session } = require('telegraf');
const http = require('http');
const config = require('./config');

const startCommand = require('./bot/commands/start');
const addadminCommand = require('./bot/commands/addadmin');
const orderCommands = require('./bot/commands/orderCommands');

const shopActions = require('./bot/actions/shopActions');
const checkoutActions = require('./bot/actions/checkoutActions');
const adminCoreActions = require('./bot/actions/adminCoreActions');
const adminCategoryActions = require('./bot/actions/adminCategoryActions');
const adminProductActions = require('./bot/actions/adminProductActions');
const masterActions = require('./bot/actions/masterActions');
const cartActions = require('./bot/actions/cartActions');
const orderActions = require('./bot/actions/orderActions');
const customerActions = require('./bot/actions/customerActions');

const addProductScene = require('./bot/scenes/addProductScene');
const addCategoryScene = require('./bot/scenes/addCategoryScene');
const renameCategoryScene = require('./bot/scenes/renameCategoryScene');
const renameProductScene = require('./bot/scenes/renameProductScene');
const addSubcategoryScene = require('./bot/scenes/addSubcategoryScene');
const renameSubcategoryScene = require('./bot/scenes/renameSubcategoryScene');
const askQuantityScene = require('./bot/scenes/askQuantityScene');
const editPriceScene = require('./bot/scenes/editPriceScene');
const broadcastScene = require('./bot/scenes/broadcastScene');
const editProductImageScene = require('./bot/scenes/editProductImageScene');
const addPaymentMethodScene = require('./bot/scenes/addPaymentMethodScene');
const checkoutScene = require('./bot/scenes/checkoutScene');
const contactScene = require('./bot/scenes/contactScene');
const editWelcomeMsgScene = require('./bot/scenes/editWelcomeMsgScene');
const feedbackScene = require('./bot/scenes/feedbackScene');

const notificationService = require('./services/notificationService');
const cronService = require('./services/cronService');

const { checkBan } = require('./bot/middlewares/auth');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Shop Bot is alive!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Health-check server listening on port ${PORT}`);
});

if (!config.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is missing');
    process.exit(1);
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

notificationService.init(bot);
cronService.init(bot);

const stage = new Scenes.Stage([
    addProductScene,
    addCategoryScene,
    renameCategoryScene,
    renameProductScene,
    addSubcategoryScene,
    renameSubcategoryScene,
    askQuantityScene,
    editPriceScene,
    broadcastScene,
    editProductImageScene,
    addPaymentMethodScene,
    checkoutScene,
    contactScene,
    editWelcomeMsgScene,
    feedbackScene
]);

bot.use(session());
bot.use(stage.middleware());
bot.use(checkBan);

bot.catch((err, ctx) => {
    console.error(`Update Error [${ctx.updateType}]:`, err.message);
});

startCommand(bot);
addadminCommand(bot);
orderCommands(bot);

shopActions(bot);
cartActions(bot);
checkoutActions(bot);
adminCoreActions(bot);
adminCategoryActions(bot);
adminProductActions(bot);
masterActions(bot);
orderActions(bot);
customerActions(bot);

const startBot = () => {
    bot.launch().then(() => {
        console.log(`Bot v${config.VERSION} started`);
        cronService.start(3600000);
    }).catch((error) => {
        console.error('Telegram Connection Error:', error.message);
        setTimeout(startBot, 5000);
    });
};

startBot();

process.once('SIGINT', () => {
    cronService.stop();
    bot.stop('SIGINT');
    server.close();
});
process.once('SIGTERM', () => {
    cronService.stop();
    bot.stop('SIGTERM');
    server.close();
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
