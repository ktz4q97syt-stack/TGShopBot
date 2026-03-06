module.exports = () => {
    return {
        inline_keyboard: [
            [{ text: '⚙️ Shop Verwaltung', callback_data: 'master_shop_management' }],
            [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders' }],
            [{ text: '🔐 Deliverables Tresor', callback_data: 'master_deliverables_tresor' }],
            [{ text: '📊 Kundenübersicht', callback_data: 'master_customer_overview' }],
            [{ text: '🛠️ Admin Panel öffnen', callback_data: 'admin_panel' }],
            [{ text: 'ℹ️ Befehle & Info', callback_data: 'master_info' }]
        ]
    };
};
