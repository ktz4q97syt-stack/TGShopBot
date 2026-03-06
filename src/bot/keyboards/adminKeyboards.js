const formatters = require('../../utils/formatters');

module.exports = {
    getAdminMenu: (isMaster) => {
        const kb = [
            [{ text: '📦 Produkte verwalten', callback_data: 'admin_manage_products' }],
            [{ text: '📁 Kategorien verwalten', callback_data: 'admin_manage_categories' }],
            [{ text: '📢 Rundnachricht', callback_data: 'admin_start_broadcast' }],
            [{ text: '📋 Offene Bestellungen', callback_data: 'admin_open_orders' }],
            [{ text: '👁 Kundenansicht', callback_data: 'shop_menu' }],
            [{ text: 'ℹ️ Befehle & Info', callback_data: 'admin_info' }]
        ];
        if (isMaster) kb.unshift([{ text: '👑 Master-Dashboard', callback_data: 'master_panel' }]);
        return { inline_keyboard: kb };
    },

    getBackToAdminPanel: () => ({
        inline_keyboard: [[{ text: '🔙 Zurück', callback_data: 'admin_panel' }]]
    }),

    getManageCategoriesMenu: (categories) => {
        const kb = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_edit_cat_${c.id}` }]));
        kb.push([{ text: '➕ Neue Kategorie', callback_data: 'admin_add_category' }]);
        kb.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
        return { inline_keyboard: kb };
    },

    getEditCategoryMenu: (categoryId, subcats) => {
        const kb = [];
        if (subcats && subcats.length > 0) {
            subcats.forEach(sc => {
                kb.push([{ text: `📂 ${sc.name}`, callback_data: `admin_edit_subcat_${sc.id}` }]);
            });
        }
        kb.push(
            [{ text: '✏️ Namen ändern', callback_data: `admin_rename_cat_${categoryId}` }],
            [{ text: '📂 Unterkategorie hinzufügen', callback_data: `admin_add_subcat_${categoryId}` }],
            [
                { text: '🔼 Hoch', callback_data: `admin_sort_cat_up_${categoryId}` },
                { text: '🔽 Runter', callback_data: `admin_sort_cat_down_${categoryId}` }
            ],
            [{ text: '🗑 Löschen', callback_data: `admin_del_cat_${categoryId}` }],
            [{ text: '🔙 Zurück', callback_data: 'admin_manage_categories' }]
        );
        return { inline_keyboard: kb };
    },

    getEditSubcategoryMenu: (subcat) => ({
        inline_keyboard: [
            [{ text: '✏️ Umbenennen', callback_data: `admin_rename_subcat_${subcat.id}` }],
            [
                { text: '🔼 Hoch', callback_data: `admin_sort_subcat_up_${subcat.id}` },
                { text: '🔽 Runter', callback_data: `admin_sort_subcat_down_${subcat.id}` }
            ],
            [{ text: '🗑 Löschen', callback_data: `admin_del_subcat_${subcat.id}` }],
            [{ text: '🔙 Zurück', callback_data: `admin_edit_cat_${subcat.category_id}` }]
        ]
    }),

    getManageProductsMenu: (categories) => {
        const kb = categories.map(c => ([{ text: `📁 ${c.name}`, callback_data: `admin_prod_cat_${c.id}` }]));
        kb.push([{ text: '📦 Kategorielose Produkte', callback_data: 'admin_prod_cat_none' }]);
        kb.push([{ text: '➕ Neues Produkt', callback_data: 'admin_add_prod_none' }]);
        kb.push([{ text: '🔙 Zurück', callback_data: 'admin_panel' }]);
        return { inline_keyboard: kb };
    },

    getProductCategoryMenu: (categoryId, subcats, directProducts) => {
        const kb = [];
        if (subcats && subcats.length > 0) {
            subcats.forEach(sc => {
                kb.push([{ text: `📂 ${sc.name}`, callback_data: `admin_prod_subcat_${sc.id}` }]);
            });
        }
        if (directProducts && directProducts.length > 0) {
            directProducts.forEach(p => {
                let label = p.name;
                if (!p.is_active) label = `👻 ${label}`;
                if (p.is_out_of_stock) label = `❌ ${label}`;
                const opt = p.delivery_option || 'none';
                if (opt === 'shipping') label = `🚚 ${label}`;
                else if (opt === 'pickup') label = `🏪 ${label}`;
                else if (opt === 'both') label = `🚚🏪 ${label}`;
                kb.push([{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }]);
            });
        }
        kb.push([{ text: '➕ Produkt hinzufügen', callback_data: `admin_add_prod_${categoryId || 'none'}` }]);
        kb.push([{ text: '🔙 Zurück', callback_data: 'admin_manage_products' }]);
        return { inline_keyboard: kb };
    },

    getProductSubcategoryMenu: (subcat, products) => {
        const kb = products.map(p => {
            let label = p.name;
            if (!p.is_active) label = `👻 ${label}`;
            if (p.is_out_of_stock) label = `❌ ${label}`;
            const opt = p.delivery_option || 'none';
            if (opt === 'shipping') label = `🚚 ${label}`;
            else if (opt === 'pickup') label = `🏪 ${label}`;
            else if (opt === 'both') label = `🚚🏪 ${label}`;
            return [{ text: `${label} (${formatters.formatPrice(p.price)})`, callback_data: `admin_edit_prod_${p.id}` }];
        });
        const backCb = subcat ? `admin_prod_cat_${subcat.category_id}` : 'admin_manage_products';
        kb.push([{ text: '🔙 Zurück', callback_data: backCb }]);
        return { inline_keyboard: kb };
    },

    getEditProductMenu: (product, deliveryLabel, backCb) => ({
        inline_keyboard: [
            [
                { text: product.is_active ? '👻 Deaktivieren' : '✅ Aktivieren', callback_data: `admin_toggle_active_${product.id}` },
                { text: product.is_out_of_stock ? '📦 Verfügbar' : '❌ Ausverkauft', callback_data: `admin_toggle_stock_${product.id}` }
            ],
            [{ text: `🚚 Lieferoption: ${deliveryLabel}`, callback_data: `admin_cycle_delivery_${product.id}` }],
            [{ text: '💰 Preis ändern', callback_data: `admin_price_${product.id}` }],
            [{ text: '✏️ Umbenennen', callback_data: `admin_rename_prod_${product.id}` }],
            [{ text: '🖼 Bild ändern', callback_data: `admin_img_${product.id}` }],
            [
                { text: '🔼 Nach oben', callback_data: `admin_sort_prod_up_${product.id}` },
                { text: '🔽 Nach unten', callback_data: `admin_sort_prod_down_${product.id}` }
            ],
            [{ text: '🗑 Löschen', callback_data: `admin_del_prod_${product.id}` }],
            [{ text: '🔙 Zurück', callback_data: backCb }]
        ]
    }),

    getCancelBackToProduct: (productId) => ({
        inline_keyboard: [[{ text: '❌ Abbrechen', callback_data: `admin_edit_prod_${productId}` }]]
    })
};
